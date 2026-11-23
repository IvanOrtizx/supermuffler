// =====================================================================
//  Super Muffler Inc. - site settings
//  Everything the shop may need to change lives here.
// =====================================================================
export const CONFIG = {
  // Back office: Google Apps Script web app URL (ends in /exec). Every form is saved as a row
  // in the shop's Google Sheet. While empty, the form asks people to call instead.
  formEndpoint: 'https://script.google.com/macros/s/AKfycbyaiB2ESRSePfRL_y8HwbhX3XHc142ER800FxH-oWG28HABCFr5FP5owOLKAjXLXQciTg/exec',

  // Shop time zone and hours (24 h clock). 0 = Sunday ... 6 = Saturday.
  timeZone: 'America/Los_Angeles',
  hours: {
    0: null,
    1: [8, 17],
    2: [8, 17],
    3: [8, 17],
    4: [8, 17],
    5: [8, 15],
    6: null
  },

  // Posts and videos to show in "Watch the work".
  //   Instagram: https://www.instagram.com/p/C8U-BTZyYVz/  ->  { platform: 'instagram', id: 'C8U-BTZyYVz' }
  //              (works for posts and reels; Instagram shows its own cover and caption)
  //   TikTok:    https://www.tiktok.com/@supermuffler/video/7301234567890123456
  //              ->  { platform: 'tiktok', id: '7301234567890123456', poster: 'img/gallery/xpipe-sm.webp', title: { en: '...', es: '...' } }
  //   YouTube:   https://youtube.com/shorts/AbCdEfGhIjK  ->  { platform: 'youtube', id: 'AbCdEfGhIjK', poster: '...', title: { en: '...', es: '...' } }
  videos: [
    { platform: 'instagram', id: 'C8U-BTZyYVz' },
    { platform: 'instagram', id: 'Dctctudgsfk' },
    { platform: 'instagram', id: 'DcbrJHZA2ev' },
    { platform: 'instagram', id: 'DW9J85TgP2S' }
  ]
};
