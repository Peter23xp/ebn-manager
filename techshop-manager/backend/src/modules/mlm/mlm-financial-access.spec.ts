import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { MlmService } from './mlm.service';
import { MlmWalletService } from './mlm-wallet.service';

describe('MLM financial staff scope', () => {
  it.each(['AGENT', 'CAISSIER'])('rejects cross-site and unassigned financial reads for %s', async role => {
    const prisma: any = { membre: { findUnique: jest.fn<any>().mockResolvedValue({ client: { siteInscriptionId: 'other-site' } }) } };
    const service: any = new MlmService(prisma, {} as never);
    const wallet: any = new MlmWalletService(prisma, {} as never, {} as never, {} as never);
    for (const siteId of ['my-site', null]) {
      const actor = { id: 'actor', role, siteId };
      await expect(service.getMemberProgress('member', actor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(wallet.getWallet('member', {}, actor)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
