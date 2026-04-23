/**
 * Ichki test audio: brauzer <audio> bilan ijro qilinadigan qisqa WAV (16-bit PCM mono).
 */

function writeString(buf, offset, str) {
  buf.write(str, offset, 'ascii');
}

/** @param {{ sampleRate: number, seconds: number, frequencyHz: number, volume: number }} opts */
export function buildTestWavBuffer({ sampleRate, seconds, frequencyHz, volume }) {
  const numSamples = Math.floor(sampleRate * seconds);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  let offset = 0;
  writeString(buffer, offset, 'RIFF');
  offset += 4;
  buffer.writeUInt32LE(36 + dataSize, offset);
  offset += 4;
  writeString(buffer, offset, 'WAVE');
  offset += 4;
  writeString(buffer, offset, 'fmt ');
  offset += 4;
  buffer.writeUInt32LE(16, offset);
  offset += 4;
  buffer.writeUInt16LE(1, offset);
                      offset += 2;
  buffer.writeUInt16LE(1, offset);
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset);
  offset += 4;
  const byteRate = sampleRate * 2;
  buffer.writeUInt32LE(byteRate, offset);
  offset += 4;
  buffer.writeUInt16LE(2, offset);
  offset += 2;
  buffer.writeUInt16LE(16, offset);
  offset += 2;
  writeString(buffer, offset, 'data');
  offset += 4;
  buffer.writeUInt32LE(dataSize, offset);
  offset += 4;

  const twoPi = Math.PI * 2;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = volume * Math.sin(twoPi * frequencyHz * t);
    if (sample > 1) sample = 1;
    if (sample < -1) sample = -1;
    const int16 = Math.round(sample * 32767);
    buffer.writeInt16LE(int16, offset + i * 2);
  }

  return buffer;
}

/** sampleId: 1 — past, 2 — yuqori ton */
export function testWavForSampleId(sampleId) {
  const id = parseInt(String(sampleId), 10);
  if (id === 1) {
    return buildTestWavBuffer({ sampleRate: 16000, seconds: 1.2, frequencyHz: 440, volume: 0.25 });
  }
  if (id === 2) {
    return buildTestWavBuffer({ sampleRate: 16000, seconds: 1.2, frequencyHz: 880, volume: 0.25 });
  }
  return null;
}

export function isTestSamplesEnabled() {
  return ['1', 'true', 'yes'].includes(String(process.env.MYSHOP_AI_TEST_SAMPLES || '').toLowerCase());
}
