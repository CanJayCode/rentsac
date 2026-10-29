// Marathi dictionary. Same keys as en.ts. The owner will review this wording.
import type { Key } from "./index";

export const mr: Record<Key, string> = {
  "app.name": "Rentsac",
  "app.tagline": "भाडे आणि लाईट बिल, अगदी सोपे.",

  "nav.label": "मुख्य मेनू",
  "nav.home": "मुख्यपृष्ठ",
  "nav.readings": "रीडिंग",
  "nav.rooms": "खोल्या",
  "nav.settings": "सेटिंग्ज",

  "lang.label": "भाषा",

  "common.save": "जतन करा",
  "common.cancel": "रद्द करा",
  "common.back": "मागे",
  "common.edit": "बदल करा",
  "common.delete": "हटवा",
  "common.confirm": "पक्के करा",
  "common.comingSoon": "ही स्क्रीन लवकरच येत आहे.",

  "status.paid": "जमा",
  "status.due": "देय",
  "status.advance": "आगाऊ",
  "status.pending": "बाकी",

  "money.rent": "भाडे",
  "money.light": "लाईट बिल",
  "money.total": "एकूण",

  "tab.all": "सर्व",
  "tab.rent": "भाडे",
  "tab.light": "लाईट",

  "home.pendingTotal": "एकूण बाकी",
  "home.empty": "अजून काहीही बाकी नाही. खोल्या आणि रीडिंग भरल्यावर कोणाकडून किती येणे आहे ते इथे दिसेल.",

  "readings.title": "रीडिंग",
  "rooms.title": "खोल्या",
  "settings.title": "सेटिंग्ज",

  "lock.unlockTitle": "तुमचा पिन टाका",
  "lock.unlockHint": "इमारतीचे हिशेब उघडण्यासाठी सहा अंकी पिन टाका.",
  "lock.chooseTitle": "पिन निवडा",
  "lock.chooseHint": "लक्षात राहतील असे सहा अंक निवडा. Rentsac उघडताना दरवेळी हाच पिन लागेल.",
  "lock.confirmTitle": "पिन पुन्हा टाका",
  "lock.confirmHint": "तेच सहा अंक पुन्हा एकदा टाका.",
  "lock.codeTitle": "सेटअप कोड टाका",
  "lock.codeHint": "हे नवीन इन्स्टॉल आहे. तुम्हाला दिलेला सेटअप कोड टाका, मग पिन निवडा.",
  "lock.codeLabel": "सेटअप कोड",
  "lock.codeContinue": "पुढे",
  "lock.wrongPin": "पिन बरोबर नाही. पुन्हा प्रयत्न करा.",
  "lock.mismatch": "दोन्ही पिन जुळले नाहीत. पुन्हा निवडा.",
  "lock.wrongCode": "सेटअप कोड बरोबर नाही. तपासून पुन्हा प्रयत्न करा.",
  "lock.alreadySet": "पिन आधीच ठरवलेला आहे. Rentsac उघडण्यासाठी तो टाका.",
  "lock.notSet": "अजून पिन ठरवलेला नाही. आधी एक निवडा.",
  "lock.lockedTitle": "खूप वेळा चुकीचा पिन टाकला",
  "lock.retry.one": "1 मिनिटाने पुन्हा प्रयत्न करा.",
  "lock.retry.many": "{minutes} मिनिटांनी पुन्हा प्रयत्न करा.",
  "lock.opening": "उघडत आहे…",
  "lock.failed": "काहीतरी चुकले. पुन्हा प्रयत्न करा.",
  "lock.deleteKey": "शेवटचा अंक काढा",
  "lock.digitsEntered": "6 पैकी {n} अंक टाकले",
};
