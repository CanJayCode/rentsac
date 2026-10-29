// English dictionary. `Key` is derived from this file, so every key added here must also be
// added to mr.ts (the type check and i18n.test.ts both enforce it).
export const en = {
  "app.name": "Rentsac",
  "app.tagline": "Rent and light bills, made simple.",

  "nav.label": "Main navigation",
  "nav.home": "Home",
  "nav.readings": "Readings",
  "nav.rooms": "Rooms",
  "nav.settings": "Settings",

  "lang.label": "Language",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.confirm": "Confirm",
  "common.comingSoon": "This screen is coming soon.",

  "status.paid": "Paid",
  "status.due": "Due",
  "status.advance": "Advance",
  "status.pending": "Pending",

  "money.rent": "Rent",
  "money.light": "Light bill",
  "money.total": "Total",

  "tab.all": "All",
  "tab.rent": "Rent",
  "tab.light": "Light",

  "home.pendingTotal": "Pending in total",
  "home.empty": "Nothing is pending yet. Once rooms and readings are added, you will see who owes what here.",

  "readings.title": "Readings",
  "rooms.title": "Rooms",
  "settings.title": "Settings",

  "lock.unlockTitle": "Enter your PIN",
  "lock.unlockHint": "Six digits to open the building's accounts.",
  "lock.chooseTitle": "Choose a PIN",
  "lock.chooseHint": "Pick six digits you will remember. You will use them each time you open Rentsac.",
  "lock.confirmTitle": "Confirm PIN",
  "lock.confirmHint": "Enter the same six digits again.",
  "lock.codeTitle": "Enter the setup code",
  "lock.codeHint": "This is a new install. Type the setup code you were given, then choose a PIN.",
  "lock.codeLabel": "Setup code",
  "lock.codeContinue": "Continue",
  "lock.wrongPin": "That PIN is not right. Try again.",
  "lock.mismatch": "The two PINs did not match. Choose again.",
  "lock.wrongCode": "That setup code is not right. Check it and try again.",
  "lock.alreadySet": "A PIN is already set. Enter it to open Rentsac.",
  "lock.notSet": "No PIN is set yet. Choose one first.",
  "lock.lockedTitle": "Too many wrong tries",
  "lock.retry.one": "Try again in 1 minute.",
  "lock.retry.many": "Try again in {minutes} minutes.",
  "lock.opening": "Opening…",
  "lock.failed": "Something went wrong. Try again.",
  "lock.deleteKey": "Delete last digit",
  "lock.digitsEntered": "{n} of 6 digits entered",
} as const satisfies Record<string, string>;
