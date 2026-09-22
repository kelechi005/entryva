import { validate } from 'class-validator';
import { IsIanaTimezone } from './is-iana-timezone.validator';

class Dummy {
  @IsIanaTimezone()
  timezone!: string;
}

async function timezoneErrors(value: unknown) {
  const instance = new Dummy();
  (instance as any).timezone = value;
  const errors = await validate(instance);
  return errors;
}

describe('IsIanaTimezone', () => {
  it.each(['Africa/Lagos', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/London'])(
    'accepts a real IANA timezone name: %s',
    async (tz) => {
      const errors = await timezoneErrors(tz);
      expect(errors).toHaveLength(0);
    },
  );

  it('rejects a typo\'d/unrecognized timezone name', async () => {
    const errors = await timezoneErrors('Africa/Lagoss');
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        isIanaTimezone: expect.stringContaining('valid IANA timezone name'),
      }),
    );
  });

  it('rejects a non-string value', async () => {
    const errors = await timezoneErrors(12345);
    expect(errors).toHaveLength(1);
  });
});
