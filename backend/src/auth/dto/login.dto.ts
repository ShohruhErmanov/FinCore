import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '+998 90 123 45 67', description: 'Telefon raqami yoki email' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  login!: string;

  @ApiProperty({ example: '••••••••', description: 'Parol' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
