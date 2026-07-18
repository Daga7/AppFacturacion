import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  UseGuards,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { TelegramService } from './telegram.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestWithUser extends ExpressRequest {
  user: { id: string; username: string; role: string };
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @UseGuards(JwtAuthGuard)
  @Post('link-code')
  createLinkCode(@Request() req: RequestWithUser) {
    return this.telegramService.createLinkCode(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  status(@Request() req: RequestWithUser) {
    return this.telegramService.status(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('links/:id')
  unlink(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.telegramService.unlink(req.user.id, id);
  }

  // Endpoint público al que Telegram envía los mensajes del bot.
  @Post('webhook')
  webhook(
    @Body() update: Record<string, unknown>,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    return this.telegramService.handleWebhook(update, secret);
  }
}
