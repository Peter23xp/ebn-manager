import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from "bcrypt";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AuthService } from "./auth.service";

/* bcrypt mocké en module entier (le spyOn sur require('bcrypt') est fragile avec ts-jest).
   Aliases typés : jest.fn() nu donne ResolveType<never>, on précise la signature. */
const compareMock = bcrypt.compare as jest.Mock<
  (...args: any[]) => Promise<boolean>
>;
const hashMock = bcrypt.hash as jest.Mock<(...args: any[]) => Promise<string>>;

describe("AuthService — password reset (persisted tokens)", () => {
  let service: AuthService;
  let prisma: any;
  let mailer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      passwordResetToken: {
        deleteMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      utilisateur: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    mailer = { sendOtpResetPassword: jest.fn() };
    service = new AuthService(
      prisma as never,
      { sign: jest.fn(), verify: jest.fn() } as never,
      { get: jest.fn() } as never,
      mailer as never,
    );
  });

  describe("forgotPassword", () => {
    it("stores a hashed OTP in DB and deletes previous tokens", async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce({
        id: "u-1",
        email: "jean@example.com",
        nom: "Jean",
        passwordHash: "x",
      });
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValueOnce({ id: "t-1" });
      hashMock.mockResolvedValueOnce("$2a$10$hashedOtp");

      const res = await service.forgotPassword({ phone: "+243812345678" });

      expect(res.success).toBe(true);
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { identifier: "+243812345678" },
      });
      const createArg = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArg.data.identifier).toBe("+243812345678");
      expect(createArg.data.otpHash).toBe("$2a$10$hashedOtp");
      // L'OTP n'est JAMAIS stocké en clair : seulement son hash
      expect(createArg.data.otp).toBeUndefined();
      expect(createArg.data.attempts).toBe(0);
      expect(createArg.data.expiresAt).toBeInstanceOf(Date);
      // L'OTP en clair (6 chiffres) est passé au mailer (3e argument)
      expect(mailer.sendOtpResetPassword).toHaveBeenCalled();
      expect(mailer.sendOtpResetPassword.mock.calls[0][2]).toMatch(/^\d{6}$/);
    });

    it("still fails with PHONE_NOT_FOUND for unknown phone", async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.forgotPassword({ phone: "+243000000000" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe("verifyOtp", () => {
    const storedToken = (over: Partial<any> = {}) => ({
      id: "t-1",
      identifier: "+243812345678",
      otpHash: "$2a$10$hash",
      attempts: 0,
      expiresAt: new Date(Date.now() + 5 * 60000),
      consumedAt: null,
      ...over,
    });

    it("issues a resetToken and consumes the OTP on success", async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValueOnce(storedToken());
      prisma.passwordResetToken.update.mockResolvedValueOnce({});
      compareMock.mockResolvedValueOnce(true);

      const res = await service.verifyOtp({
        phone: "+243812345678",
        otp: "123456",
      });

      expect(res.success).toBe(true);
      expect(res.resetToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(compareMock).toHaveBeenCalledWith("123456", "$2a$10$hash");
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "t-1" },
          data: expect.objectContaining({
            consumedAt: expect.any(Date),
            attempts: { increment: 1 },
            resetToken: res.resetToken,
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it("rejects after expiry and deletes the token", async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValueOnce(
        storedToken({ expiresAt: new Date(Date.now() - 60000) }),
      );
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 1 });

      await expect(
        service.verifyOtp({ phone: "+243812345678", otp: "123456" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { identifier: "+243812345678" },
      });
    });

    it("rejects when no unconsumed token exists", async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValueOnce(null);
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.verifyOtp({ phone: "+243812345678", otp: "123456" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("increments attempts and returns attemptsLeft on wrong OTP", async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValueOnce(
        storedToken({ attempts: 1 }),
      );
      prisma.passwordResetToken.update.mockResolvedValueOnce({});
      compareMock.mockResolvedValueOnce(false);

      await expect(
        service.verifyOtp({ phone: "+243812345678", otp: "999999" }),
      ).rejects.toMatchObject({
        response: { error: { code: "INVALID_OTP", attemptsLeft: 1 } },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: "t-1" },
        data: { attempts: { increment: 1 } },
      });
    });

    it("blocks after too many attempts", async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValueOnce(
        storedToken({ attempts: 3 }),
      );
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 1 });

      await expect(
        service.verifyOtp({ phone: "+243812345678", otp: "123456" }),
      ).rejects.toMatchObject({
        response: { error: { code: "TOO_MANY_OTP_ATTEMPTS" } },
      });
      expect(compareMock).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("updates the password and consumes the reset token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: "t-1",
        identifier: "+243812345678",
        resetToken: "uuid-1",
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: null,
      });
      prisma.utilisateur.findFirst.mockResolvedValueOnce({
        id: "u-1",
        passwordHash: "$2a$12$old",
      });
      compareMock.mockResolvedValueOnce(false); // sameAsOld → false
      hashMock.mockResolvedValueOnce("$2a$12$new");
      prisma.utilisateur.update.mockResolvedValueOnce({});
      prisma.passwordResetToken.update.mockResolvedValueOnce({});

      const res = await service.resetPassword({
        resetToken: "uuid-1",
        newPassword: "N3wPassword",
      });

      expect(res.success).toBe(true);
      expect(prisma.utilisateur.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u-1" },
          data: expect.objectContaining({ passwordHash: "$2a$12$new" }),
        }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: "t-1" },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it("refuses an already-consumed reset token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: "t-1",
        identifier: "+243812345678",
        resetToken: "uuid-1",
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: new Date(),
      });
      await expect(
        service.resetPassword({
          resetToken: "uuid-1",
          newPassword: "N3wPassword",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it("refuses an expired reset token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: "t-1",
        identifier: "+243812345678",
        resetToken: "uuid-1",
        expiresAt: new Date(Date.now() - 60000),
        consumedAt: null,
      });
      await expect(
        service.resetPassword({
          resetToken: "uuid-1",
          newPassword: "N3wPassword",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("refuses a password identical to the old one", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: "t-1",
        identifier: "+243812345678",
        resetToken: "uuid-1",
        expiresAt: new Date(Date.now() + 60000),
        consumedAt: null,
      });
      prisma.utilisateur.findFirst.mockResolvedValueOnce({
        id: "u-1",
        passwordHash: "$2a$12$old",
      });
      compareMock.mockResolvedValueOnce(true); // sameAsOld → true

      await expect(
        service.resetPassword({
          resetToken: "uuid-1",
          newPassword: "N3wPassword",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });
  });

  describe("purgeExpiredResetTokens", () => {
    it("deletes tokens expired for more than 24h", async () => {
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 2 });

      await service.purgeExpiredResetTokens();

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
