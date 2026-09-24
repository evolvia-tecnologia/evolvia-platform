import { IsString, MaxLength, MinLength } from 'class-validator';
import { RegisterDto } from './register.dto';

export class ParticipantRegisterDto extends RegisterDto {
  @IsString() @MinLength(20) @MaxLength(20)
  protocol!: string;

  @IsString() @MinLength(5) @MaxLength(50)
  identityDocument!: string;
}
