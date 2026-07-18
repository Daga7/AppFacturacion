import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Vinculación de cuentas con Telegram (varios chats por usuario):
// 1. El usuario genera un código único en la app (vence en 15 minutos).
// 2. Abre el bot y envía: /vincular TG-XXXXXX
// 3. Telegram llama al webhook; se valida el código, se guarda el chat como
//    un TelegramLink de la cuenta y queda verificado. Para vincular otro
//    dispositivo/chat se genera un código nuevo.

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_LINKS_PER_USER = 5;

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string; title?: string; first_name?: string };
    from?: { username?: string; first_name?: string };
  };
}

@Injectable()
export class TelegramService {
  constructor(private prisma: PrismaService) {}

  private generateCode() {
    return `TG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async createLinkCode(userId: string) {
    const count = await this.prisma.telegramLink.count({ where: { userId } });
    if (count >= MAX_LINKS_PER_USER) {
      throw new BadRequestException(
        `Ya tienes ${MAX_LINKS_PER_USER} chats vinculados; desvincula alguno para agregar otro`,
      );
    }

    const code = this.generateCode();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramLinkCode: code,
        telegramLinkExpires: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return {
      code,
      command: `/vincular ${code}`,
      expiresInMinutes: 15,
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
    };
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { telegramLinks: { orderBy: { createdAt: 'asc' } } },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return {
      linked: user.telegramLinks.length > 0,
      links: user.telegramLinks.map((l) => ({
        id: l.id,
        chatId: l.chatId,
        label: l.label,
        verifiedAt: l.verifiedAt.toISOString(),
      })),
      maxLinks: MAX_LINKS_PER_USER,
      pendingCode: user.telegramLinkCode,
    };
  }

  // Desvincula un chat específico del usuario.
  async unlink(userId: string, linkId: string) {
    const link = await this.prisma.telegramLink.findUnique({
      where: { id: linkId },
    });
    if (!link || link.userId !== userId) {
      throw new NotFoundException('Vínculo no encontrado');
    }
    await this.prisma.telegramLink.delete({ where: { id: linkId } });
    return { message: 'Chat desvinculado' };
  }

  // Clave de sede para variables de entorno: "Ocaña" -> "OCANA".
  private branchKey(name: string) {
    return name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
  }

  // Token del bot a usar: el específico de la sede si existe
  // (TELEGRAM_BOT_TOKEN_OCANA...), o el global.
  tokenFor(branchName?: string | null, botKey?: string | null) {
    const key = botKey
      ? this.branchKey(botKey)
      : branchName
        ? this.branchKey(branchName)
        : null;
    if (key) {
      const specific = process.env[`TELEGRAM_BOT_TOKEN_${key}`];
      if (specific) return specific;
    }
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  // Notifica a los chats autorizados: todos los vínculos de usuarios ADMIN y
  // SUPERVISOR, sin repetir chats.
  async notifyStaff(branchName: string, text: string) {
    const links = await this.prisma.telegramLink.findMany({
      where: { user: { role: { in: ['ADMIN', 'SUPERVISOR'] } } },
    });
    const chatIds = [...new Set(links.map((l) => l.chatId))];
    const token = this.tokenFor(branchName);
    await Promise.allSettled(
      chatIds.map((chatId) => this.sendMessage(chatId, text, token)),
    );
    return { recipients: chatIds.length };
  }

  // Webhook público que recibe los mensajes que le llegan al bot. `botKey`
  // identifica al bot cuando hay uno por sede.
  async handleWebhook(
    update: TelegramUpdate,
    secretHeader?: string,
    botKey?: string,
  ) {
    // Si hay secreto configurado, ignorar peticiones que no lo traigan.
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && secretHeader !== secret) return { ok: true };

    const replyToken = this.tokenFor(null, botKey);
    const text = update?.message?.text;
    const chatId = update?.message?.chat?.id;
    if (!text || chatId === undefined) return { ok: true };

    const match = text
      .trim()
      .match(/^\/vincular(?:@\w+)?\s+(TG-[A-F0-9]{6})\b/i);
    if (!match) {
      if (text.trim().startsWith('/')) {
        await this.sendMessage(
          chatId,
          'Para vincular tu cuenta, genera un código en la app y envíame: /vincular TG-XXXXXX',
          replyToken,
        );
      }
      return { ok: true };
    }

    const code = match[1].toUpperCase();
    const user = await this.prisma.user.findFirst({
      where: { telegramLinkCode: code },
      include: { telegramLinks: true },
    });

    if (
      !user ||
      !user.telegramLinkExpires ||
      user.telegramLinkExpires < new Date()
    ) {
      await this.sendMessage(
        chatId,
        'Código inválido o vencido. Genera uno nuevo desde la app e inténtalo de nuevo.',
        replyToken,
      );
      return { ok: true };
    }

    const alreadyLinked = user.telegramLinks.some(
      (l) => l.chatId === String(chatId),
    );
    if (!alreadyLinked && user.telegramLinks.length >= MAX_LINKS_PER_USER) {
      await this.sendMessage(
        chatId,
        `La cuenta "${user.username}" ya tiene ${MAX_LINKS_PER_USER} chats vinculados; desvincula alguno desde la app.`,
        replyToken,
      );
      return { ok: true };
    }

    const label =
      update.message?.from?.username ??
      update.message?.from?.first_name ??
      update.message?.chat?.title ??
      null;

    await this.prisma.$transaction([
      this.prisma.telegramLink.upsert({
        where: { userId_chatId: { userId: user.id, chatId: String(chatId) } },
        create: { userId: user.id, chatId: String(chatId), label },
        update: { label, verifiedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { telegramLinkCode: null, telegramLinkExpires: null },
      }),
    ]);

    const total = user.telegramLinks.length + (alreadyLinked ? 0 : 1);
    await this.sendMessage(
      chatId,
      `✅ Telegram vinculado correctamente a la cuenta "${user.username}" (${total} de ${MAX_LINKS_PER_USER} chats).`,
      replyToken,
    );
    return { ok: true };
  }

  // Envía un mensaje por el bot; si no hay token configurado, no hace nada.
  async sendMessage(
    chatId: number | string,
    text: string,
    token = process.env.TELEGRAM_BOT_TOKEN,
  ) {
    if (!token) return false;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      return true;
    } catch {
      // El envío es best-effort: nunca debe romper la operación principal.
      return false;
    }
  }
}
