import { HttpStatus } from '@nestjs/common';
import { NotificationType } from 'generated/prisma';
import { EstateWebException } from '../exceptions/estateweb.exception';
import {
  extractUpstreamStatus,
  formatEstateWebError,
  mapHttpStatusToException,
} from './estateweb-error.util';

describe('estateweb-error.util', () => {
  describe('mapHttpStatusToException', () => {
    it('maps 5xx to upstream server error without empty body field', () => {
      const error = mapHttpStatusToException(
        500,
        'POST',
        '/api/property',
        '',
      );

      expect(error).toBeInstanceOf(EstateWebException);
      expect(error.code).toBe(NotificationType.ESTATEWEB_SERVER_ERROR);
      expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(error.message).toBe(
        'EstateWeb upstream HTTP 500 on POST /api/property (empty body)',
      );
      expect(error.details).toEqual({
        method: 'POST',
        path: '/api/property',
        upstreamStatus: 500,
      });
      expect(error.details).not.toHaveProperty('body');
    });

    it('keeps non-empty upstream body in details', () => {
      const error = mapHttpStatusToException(
        500,
        'POST',
        '/api/property',
        '{"error":"boom"}',
      );

      expect(error.details).toEqual({
        method: 'POST',
        path: '/api/property',
        upstreamStatus: 500,
        body: '{"error":"boom"}',
      });
      expect(error.message).toBe(
        'EstateWeb upstream HTTP 500 on POST /api/property',
      );
    });
  });

  describe('formatEstateWebError', () => {
    it('formats server errors without dumping duplicate details json', () => {
      const error = mapHttpStatusToException(
        500,
        'POST',
        '/api/property',
        '',
      );

      expect(formatEstateWebError(error)).toBe(
        'EstateWeb upstream HTTP 500 on POST /api/property (empty body)',
      );
    });

    it('appends body text when upstream returned one', () => {
      const error = mapHttpStatusToException(
        400,
        'POST',
        '/api/property',
        'invalid type',
      );

      expect(formatEstateWebError(error)).toBe(
        'EstateWeb API rejected HTTP 400 on POST /api/property | body=invalid type',
      );
    });
  });

  describe('extractUpstreamStatus', () => {
    it('reads upstreamStatus from exception details', () => {
      const error = mapHttpStatusToException(
        502,
        'GET',
        '/api/property/1',
        '',
      );
      expect(extractUpstreamStatus(error)).toBe(502);
    });
  });
});
