import { Body, Controller, Post } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionRequestDto } from './prescriptions.dto';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  /**
   * The core call. §21.2.
   * Returns either a Snap or an explicit hold — never a hard error.
   */
  @Post('next')
  next(@Body() body: PrescriptionRequestDto) {
    return this.prescriptions.next(body);
  }
}
