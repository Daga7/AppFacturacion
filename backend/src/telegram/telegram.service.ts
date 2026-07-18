import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Vinculación de cuentas con Telegram:
// 1. El usuario genera un código único en la app (vence en 15 minutos).
// 2. Abre el bot y envía: /vincular TG-XXXXXX
// 3. Telegram llama al webhook; se valida el código, se guarda el chat_id en
//    la cuenta y queda verificado. Nadie puede vincularse sin acceso al sistema.

const CODE_TTL_MS = 15 * 60 * 1000;

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    from?: { username?: string };
  };
}

@Injectable()
export class TelegramService {
  constructor(private prisma: PrismaService) {}

  private generateCode() {
    return `TG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async createLinkCode(userId: string) {
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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return {
      linked: Boolean(user.telegramChatId),
      chatId: user.telegramChatId,
      verifiedAt: user.telegramVerifiedAt?.toISOString() ?? null,
      pendingCode: user.telegramLinkCode,
    };
  }

  async unlink(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramChatId: null,
        telegramVerifiedAt: null,
        telegramLinkCode: null,
        telegramLinkExpires: null,
      },
    });
    return { message: 'Telegram desvinculado' };
  }

  // Webhook público que recibe los mensajes que le llegan al bot.
  async handleWebhook(update: TelegramUpdate, secretHeader?: string) {
    // Si hay secreto configurado, ignorar peticiones que no lo traigan.
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && secretHeader !== secret) return { ok: true };

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
        );
      }
      return { ok: true };
    }

    const code = match[1].toUpperCase();
    const user = await this.prisma.user.findFirst({
      where: { telegramLinkCode: code },
    });

    if (
      !user ||
      !user.telegramLinkExpires ||
      user.telegramLinkExpires < new Date()
    ) {
      await this.sendMessage(
        chatId,
        'Código inválido o vencido. Genera uno nuevo desde la app e inténtalo de nuevo.',
      );
      return { ok: true };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        telegramChatId: String(chatId),
        telegramVerifiedAt: new Date(),
        telegramLinkCode: null,
        telegramLinkExpires: null,
      },
    });

    await this.sendMessage(
      chatId,
      `✅ Telegram vinculado correctamente a la cuenta "${user.username}".`,
    );
    return { ok: true };
  }

  // Envía un mensaje por el bot; si no hay token configurado, no hace nada.
  async sendMessage(chatId: number | string, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch {
      // La vinculación ya quedó guardada; el mensaje de confirmación es best-effort.
    }
  }
}
