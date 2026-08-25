import { ApiProperty } from '@nestjs/swagger';

/** Response of POST /notifications/telegram/link. The raw token appears here and nowhere else. */
export class TelegramLinkCreatedResponseDto {
  @ApiProperty({
    example: 'https://t.me/fincore_bot?start=…',
    description: 'Bir martalik havola. Saqlanmaydi va logga yozilmaydi.',
  })
  deepLink!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

/** Safe status projection — carries no chat id and no numeric Telegram id. */
export class TelegramLinkStatusResponseDto {
  @ApiProperty({ enum: ['linked', 'unlinked', 'disabled', 'pending'] })
  status!: 'linked' | 'unlinked' | 'disabled' | 'pending';

  @ApiProperty({ nullable: true, description: 'Faqat ko‘rsatish uchun' })
  telegramUsername!: string | null;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  linkedAt!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  pendingExpiresAt!: string | null;
}

export class TelegramWebhookAckDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
