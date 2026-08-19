import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicService } from './public.service';
import { CreateAmbassadeurApplicationDto } from './dto/ambassadeur-application.dto';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Post('ambassadeur-application')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  createAmbassadeurApplication(@Body() dto: CreateAmbassadeurApplicationDto) {
    return this.publicService.createAmbassadeurApplication(dto);
  }
}