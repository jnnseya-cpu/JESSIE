import { Module } from '@nestjs/common';
import { BandStoreService } from './band-store.service';

/**
 * The band store, on its own, because two modules need it.
 *
 * `BodyModule` writes the band and already imports `FoodlensModule` for
 * the ledger the band is anchored on. `FoodlensModule` has to read the
 * band to colour a scanned day. Putting the store in either one makes the
 * pair circular, and `forwardRef` would hide that rather than resolve it.
 *
 * A store that two features share is its own thing. This is the smaller
 * truth the circularity was pointing at.
 */
@Module({
  providers: [BandStoreService],
  exports: [BandStoreService],
})
export class BandModule {}
