import { RegisterDto } from './register.dto';

// A conta pode ser criada antes de qualquer inscrição. O protocolo só é pedido para vincular uma inscrição existente.
export class ParticipantRegisterDto extends RegisterDto {}
