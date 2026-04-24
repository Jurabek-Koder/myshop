/** Admin test: yangi operator mega-prompt bilan mos namuna (Vapi transcript qatorlari). */

export const TEST_CONVERSATION_VAPI_ID = 'myshop-test-conversation';

export const TEST_DIALOGUE_LINES = [
  {
    event_type: 'transcript:user:unknown:final',
    text: 'Ha, men edim. Gapiring.',
  },
  {
    event_type: 'transcript:assistant:unknown:final',
    text: 'Buyurtmani tasdiqlaysizmi?',
  },
  {
    event_type: 'transcript:user:unknown:final',
    text: 'Ha, tasdiqlayman.',
  },
  {
    event_type: 'transcript:assistant:unknown:final',
    text: 'Rahmat. Ikki xil variant bor. Uyga yetkazib beramiz yoki markazdan olib ketasiz. Qaysi biri sizga qulay?',
  },
  {
    event_type: 'transcript:user:unknown:final',
    text: 'Uyga yetkazib bering, iltimos.',
  },
  {
    event_type: 'transcript:assistant:unknown:final',
    text: 'Yaxshi, tushundim. Tez orada kuryer bog‘lanadi. Yaxshi kun!',
  },
];
