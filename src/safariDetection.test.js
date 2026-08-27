import { isSafariBrowser, markSafariBrowser } from "./safariDetection";

const APPLE_VENDOR = "Apple Computer, Inc.";
const DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("Safari detection", () => {
  test.each([DESKTOP_SAFARI, IOS_SAFARI])(
    "recognizes Safari with an Apple vendor",
    (userAgent) => {
      expect(isSafariBrowser({ userAgent, vendor: APPLE_VENDOR })).toBe(true);
    }
  );

  test.each([
    "Chrome",
    "Chromium",
    "CriOS",
    "FxiOS",
    "EdgiOS",
    "OPR",
    "OPiOS",
    "Android",
  ])("excludes %s user agents", (excludedBrowser) => {
    expect(
      isSafariBrowser({
        userAgent: `${DESKTOP_SAFARI} ${excludedBrowser}/1.0`,
        vendor: APPLE_VENDOR,
      })
    ).toBe(false);
  });

  test("requires both the Apple vendor and a Safari user agent", () => {
    expect(
      isSafariBrowser({ userAgent: DESKTOP_SAFARI, vendor: "Google Inc." })
    ).toBe(false);
    expect(
      isSafariBrowser({ userAgent: "AppleWebKit/605.1.15", vendor: APPLE_VENDOR })
    ).toBe(false);
  });

  test("marks and clears the standalone document element", () => {
    const root = document.documentElement;
    root.classList.remove("browser-safari");

    expect(
      markSafariBrowser(root, {
        userAgent: DESKTOP_SAFARI,
        vendor: APPLE_VENDOR,
      })
    ).toBe(true);
    expect(root).toHaveClass("browser-safari");

    expect(
      markSafariBrowser(root, {
        userAgent: `${DESKTOP_SAFARI} CriOS/126.0`,
        vendor: APPLE_VENDOR,
      })
    ).toBe(false);
    expect(root).not.toHaveClass("browser-safari");
  });
});
