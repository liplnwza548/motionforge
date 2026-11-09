/**
 * applyPolish - ปรับปรุงคุณภาพภาพบนพิกเซล RGBA ใน Canvas 2D ด้วย 4 เอฟเฟกต์ต่อเนื่อง
 * 
 * @param {Uint8ClampedArray} data   - อาร์เรย์พิกเซล RGBA ความยาว width * height * 4
 * @param {number} width            - ความกว้างของภาพ (พิกเซล)
 * @param {number} height           - ความสูงของภาพ (พิกเซล) แกน y ชี้ลง
 * @param {number} t                - เวลาปัจจุบัน (วินาที)
 * @param {number} speed            - ความเร็วหัววาฬ (px/s) จาก telemetry (รวม surge แล้ว)
 * @returns {Uint8ClampedArray}     - อาร์เรย์ data เดิมที่ผ่านการโปรเซสแล้ว
 */
function applyPolish(data, width, height, t, speed) {
  // ==========================================
  // ค่าคงที่ควบคุมเอฟเฟกต์ (เป็นค่าสัมบูรณ์ทั้งหมด ห้ามติดลบ)
  // ==========================================
  // 1. grain strength: แอมพลิจูดความแรงของฟิล์มเกรน
  const GRAIN_STRENGTH = Math.abs(12.0);

  // 2. รัศมีเบลอสูงสุด: ขีดจำกัดสูงสุดของรัศมี Motion Blur แนวนอน (พิกเซล)
  const MAX_BLUR_RADIUS = Math.abs(14);

  // 3. ค่า k ที่ผูก blur กับ speed: ตัวคูณแปลง speed (px/s) เป็นรัศมีเบลอ
  const K_SPEED = Math.abs(0.025);

  // 4. รัศมี SSS: รัศมีกระจายแสง Subsurface Scattering เฉพาะที่ (พิกเซล)
  const SSS_RADIUS = Math.abs(2);

  // 5. ความแรง SSS: สัดส่วนการเกลี่ยแสงโทนอุ่นตามขอบสว่าง (0.0 ถึง 1.0)
  const SSS_STRENGTH = Math.abs(0.35);

  // 6. ระยะ shift ของ chromatic: ระยะเลื่อนพิกเซลของช่องสีแดง/น้ำเงิน (1 ถึง 2 พิกเซล)
  const CHROMATIC_SHIFT = Math.min(2, Math.max(1, Math.round(Math.abs(1.5))));

  const totalPixels = width * height;
  const totalBytes = totalPixels * 4;

  // เตรียมบัฟเฟอร์ชั่วคราว 2 ชุดเพื่อการอ่านเขียนข้างเคียงที่แม่นยำ
  const pass1 = new Uint8ClampedArray(totalBytes);
  const pass2 = new Uint8ClampedArray(totalBytes);

  // คำนวณความเร็วและทิศทางการเคลื่อนที่แนวนอน
  const absSpeed = Math.abs(speed);
  // moveDir: 1 = เคลื่อนไปทางขวา (เบลอลากไปทางซ้าย), -1 = เคลื่อนไปทางซ้าย, 0 = หยุดนิ่ง
  const moveDir = speed > 0 ? 1 : (speed < 0 ? -1 : 0);

  // =========================================================================
  // ขั้นที่ 1: Horizontal Motion Blur ตามทิศการเคลื่อนที่ (โตตาม speed, speed=0 ไม่เบลอ)
  // =========================================================================
  const blurRadius = Math.min(MAX_BLUR_RADIUS, Math.round(absSpeed * K_SPEED));

  if (blurRadius === 0) {
    // กรณี speed เป็น 0 หรือต่ำมากจนรัศมีเป็น 0 จะไม่เบลอเลย
    pass1.set(data);
  } else {
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
        let count = 0;

        // สุ่มตัวอย่างตามหางทิศทางการเคลื่อนที่ (Opposite direction trail)
        for (let s = 0; s <= blurRadius; s++) {
          const sampleX = Math.min(width - 1, Math.max(0, x - moveDir * s));
          const idx = (rowOffset + sampleX) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          sumA += data[idx + 3];
          count++;
        }

        const outIdx = (rowOffset + x) * 4;
        pass1[outIdx]     = sumR / count;
        pass1[outIdx + 1] = sumG / count;
        pass1[outIdx + 2] = sumB / count;
        pass1[outIdx + 3] = sumA / count;
      }
    }
  }

  // =========================================================================
  // ขั้นที่ 2: Subsurface Scattering แบบง่าย (นุ่มขอบสว่าง + เติมโทนอุ่น + ไม่มืดลง)
  // =========================================================================
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIdx = (y * width + x) * 4;
      const cR = pass1[centerIdx];
      const cG = pass1[centerIdx + 1];
      const cB = pass1[centerIdx + 2];
      const cA = pass1[centerIdx + 3];

      // ความสว่างจุดกึ่งกลาง (Perceived Luminance)
      const centerLum = 0.299 * cR + 0.587 * cG + 0.114 * cB;

      // เบลอความสว่างเฉพาะที่แบบรัศมีเล็ก (SSS_RADIUS)
      let sumLum = 0;
      let count = 0;
      for (let dy = -SSS_RADIUS; dy <= SSS_RADIUS; dy++) {
        const py = Math.min(height - 1, Math.max(0, y + dy));
        const pRow = py * width;
        for (let dx = -SSS_RADIUS; dx <= SSS_RADIUS; dx++) {
          const px = Math.min(width - 1, Math.max(0, x + dx));
          const pIdx = (pRow + px) * 4;
          sumLum += 0.299 * pass1[pIdx] + 0.587 * pass1[pIdx + 1] + 0.114 * pass1[pIdx + 2];
          count++;
        }
      }
      const localLum = sumLum / count;

      // ตรวจจับการกระจายแสงจากบริเวณที่สว่างกว่าเข้าสู่ขอบข้างเคียง
      // ค่า scatter จะมีค่าเฉพาะเมื่อมีแสงตกกระทบกระจาย (non-negative เสมอ)
      const edgeScatter = Math.max(0, localLum - centerLum);
      const highlightPenumbra = (localLum > 140) ? (localLum - 140) * 0.15 : 0;
      const totalScatter = (edgeScatter + highlightPenumbra) * SSS_STRENGTH;

      // เติมโทนอุ่น (Red ถ่ายทอดลึกสุด, Green ปานกลาง, Blue ต่ำสุด)
      // ใช้การบวกค่าเพิ่ม (Additive/Scatter) จึงรับประกันว่าภาพรวมจะไม่มีทางมืดลง
      pass2[centerIdx]     = Math.min(255, cR + totalScatter * 1.0);
      pass2[centerIdx + 1] = Math.min(255, cG + totalScatter * 0.45);
      pass2[centerIdx + 2] = Math.min(255, cB + totalScatter * 0.12);
      pass2[centerIdx + 3] = cA;
    }
  }

  // =========================================================================
  // ขั้นที่ 3: Chromatic Aberration และ Subtle Bloom ที่ขอบสว่าง
  // =========================================================================
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;
      const r = pass2[idx];
      const g = pass2[idx + 1];
      const b = pass2[idx + 2];
      const a = pass2[idx + 3];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // ตรวจสอบความต่างระดับแสงแนวนอนเพื่อหาขอบสว่าง (Bright Edge)
      const leftX = Math.max(0, x - 1);
      const rightX = Math.min(width - 1, x + 1);
      const lIdx = (rowOffset + leftX) * 4;
      const rIdx = (rowOffset + rightX) * 4;
      const lumLeft = 0.299 * pass2[lIdx] + 0.587 * pass2[lIdx + 1] + 0.114 * pass2[lIdx + 2];
      const lumRight = 0.299 * pass2[rIdx] + 0.587 * pass2[rIdx + 1] + 0.114 * pass2[rIdx + 2];
      const gradX = Math.abs(lumRight - lumLeft);

      // เงื่อนไขขอบสว่าง: สว่างเพียงพอร่วมกับมีความเปรียบต่าง หรือเป็นจุดไฮไลต์เข้ม
      const isBrightEdge = (lum > 120 || lumLeft > 120 || lumRight > 120) && (gradX > 20 || lum > 200);

      let outR = r;
      let outG = g;
      let outB = b;

      if (isBrightEdge) {
        // เลื่อนช่องแดงไปทางขวา (ดึงพิกเซลจากทางซ้าย x - shift)
        const rx = Math.max(0, x - CHROMATIC_SHIFT);
        outR = pass2[(rowOffset + rx) * 4];

        // เลื่อนช่องน้ำเงินไปทางซ้าย (ดึงพิกเซลจากทางขวา x + shift)
        const bx = Math.min(width - 1, x + CHROMATIC_SHIFT);
        outB = pass2[(rowOffset + bx) * 4 + 2];
      }

      // Bloom เบาๆ บนบริเวณไฮไลต์ที่สว่างจ้า (threshold 175)
      const bloom = Math.max(0, lum - 175) * 0.18;
      pass1[idx]     = Math.min(255, outR + bloom);
      pass1[idx + 1] = Math.min(255, outG + bloom);
      pass1[idx + 2] = Math.min(255, outB + bloom);
      pass1[idx + 3] = a;
    }
  }

  // =========================================================================
  // ขั้นที่ 4: Temporal Film Grain (Seed อิง Math.floor(t * 30), เปลี่ยนทุกเฟรม)
  // =========================================================================
  const frameSeed = Math.floor(Math.abs(t) * 30);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * 4;

      // Integer Hash PRNG ความเร็วสูง ให้ noise ในช่วง [-1.0, 1.0]
      // seed เปลี่ยนแปลงตาม frameSeed ทุกๆ 1/30 วินาที ทำให้ไม่เกิด noise นิ่ง
      let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(frameSeed, 1013904223);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h = h ^ (h >>> 16);
      const normalizedNoise = ((h & 0xFFFF) / 32767.5) - 1.0;

      const grain = normalizedNoise * GRAIN_STRENGTH;

      // เขียนกลับลง data อาร์เรย์เดิมโดยตรงและ Clamp ให้อยู่ในช่วง [0, 255]
      data[idx]     = Math.min(255, Math.max(0, pass1[idx] + grain));
      data[idx + 1] = Math.min(255, Math.max(0, pass1[idx + 1] + grain));
      data[idx + 2] = Math.min(255, Math.max(0, pass1[idx + 2] + grain));
      data[idx + 3] = pass1[idx + 3]; // คงค่า Alpha เดิม
    }
  }

  return data;
}
