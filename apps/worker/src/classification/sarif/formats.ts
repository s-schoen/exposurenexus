import { z } from "zod/v4";

// RFC 3986 syntax, without WHATWG URL repair. In particular, URI references may
// be relative, percent escapes must be complete, and whitespace is never valid.
const unreserved = "[A-Za-z0-9._~-]";
const pctEncoded = "%[A-Fa-f0-9]{2}";
const subDelimiter = "[!$&'()*+,;=]";
const character = `(?:${unreserved}|${pctEncoded}|${subDelimiter}|[:@])`;
const segment = `${character}*`;

// RFC 3986 section 3.2.2: ls32 may be two hexadecimal groups OR an IPv4 address.
// Spell out the compression alternatives to account for exactly eight groups.
const h16 = "[A-Fa-f0-9]{1,4}";
const octet = "(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])";
const ipv4 = `${octet}(?:\\.${octet}){3}`;
const ls32 = `(?:${h16}:${h16}|${ipv4})`;
const ipv6 = [
  `(?:${h16}:){6}${ls32}`,
  `::(?:${h16}:){5}${ls32}`,
  `(?:${h16})?::(?:${h16}:){4}${ls32}`,
  `(?:(?:${h16}:){0,1}${h16})?::(?:${h16}:){3}${ls32}`,
  `(?:(?:${h16}:){0,2}${h16})?::(?:${h16}:){2}${ls32}`,
  `(?:(?:${h16}:){0,3}${h16})?::${h16}:${ls32}`,
  `(?:(?:${h16}:){0,4}${h16})?::${ls32}`,
  `(?:(?:${h16}:){0,5}${h16})?::${h16}`,
  `(?:(?:${h16}:){0,6}${h16})?::`,
].join("|");
const ipLiteral = `\\[(?:${ipv6}|[vV][A-Fa-f0-9]+\\.(?:${unreserved}|${subDelimiter}|:)+)\\]`;
const host = `(?:${ipLiteral}|(?:${unreserved}|${pctEncoded}|${subDelimiter})*)`;
const authority = `(?:(?:${unreserved}|${pctEncoded}|${subDelimiter}|:)*@)?${host}(?::[0-9]*)?`;
const absolutePath = `(?:/${segment})*`;
const hierarchy = `(?://${authority}${absolutePath}|/(?:${character}+(?:/${segment})*)?|${character}+(?:/${segment})*|)`;
const scheme = "[A-Za-z][A-Za-z0-9+.-]*:";
const suffix = `(?:\\?(?:${character}|[/?])*)?(?:#(?:${character}|[/?])*)?`;
const relativeFirst = `(?:${unreserved}|${pctEncoded}|${subDelimiter}|@)+`;
const relative = `(?://${authority}${absolutePath}|/(?:${character}+(?:/${segment})*)?|${relativeFirst}(?:/${segment})*|)`;

// Unlike $, this end assertion also rejects a final newline.
const end = "(?![\\s\\S])";
export const uriSchema = z.string().regex(new RegExp(`^${scheme}${hierarchy}${suffix}${end}`));
const uriReferenceSchema = z
  .string()
  .regex(new RegExp(`^(?:${scheme}${hierarchy}|${relative})${suffix}${end}`));

const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))(?![\s\S])/u;

function isRfc3339(value: string): boolean {
  const match = dateTimePattern.exec(value);
  if (match === null) {
    return false;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    sign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText ?? 0);
  const offsetMinute = Number(offsetMinuteText ?? 0);

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysPerMonth[month - 1]) {
    return false;
  }
  if (hour > 23 || minute > 59 || second > 60 || offsetHour > 23 || offsetMinute > 59) {
    return false;
  }

  if (second === 60) {
    // RFC 3339 permits leap seconds only at UTC month-end, 23:59. Apply the
    // offset to the whole calendar value, not just the time of day. Using the
    // preceding second avoids Date normalizing :60 into the following minute.
    const offset = (offsetHour * 60 + offsetMinute) * (sign === "-" ? -1 : 1);
    const utc = new Date(0);
    // setUTCFullYear also handles years 0000–0099 without Date.UTC's 1900 offset.
    utc.setUTCFullYear(year, month - 1, day);
    utc.setUTCHours(hour, minute - offset, 59, 0);

    const followingDay = new Date(utc);
    followingDay.setUTCDate(utc.getUTCDate() + 1);
    const isMonthEnd = followingDay.getUTCDate() === 1;

    // Check the calendar rule, without requiring a historical leap-second table.
    return isMonthEnd && utc.getUTCHours() === 23 && utc.getUTCMinutes() === 59;
  }

  return true;
}

export const sarifFormats: ReadonlyMap<string, z.ZodType> = new Map([
  ["uri", uriSchema],
  ["uri-reference", uriReferenceSchema],
  ["date-time", z.string().refine(isRfc3339)],
]);
