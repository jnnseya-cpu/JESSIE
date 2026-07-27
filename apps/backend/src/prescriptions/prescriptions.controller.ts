import { Body, Controller, Post } from '@nestjs/common';
import { PrescriptionsService, type PrescriptionRequest } from './prescriptions.service';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  /**
   * The core call. §21.2.
   * Returns either a Snap or an explicit hold — never a hard error.
   */
  @Post('next')
  next(@Body() body: PrescriptionRequest) {
    return this.prescriptions.next(body);
  }
}
