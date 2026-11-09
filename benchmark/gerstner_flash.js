// ค่าคงที่ 4 ระลอก (A px, lambda px, direction, omega rad/s, Q, phi rad):
// (26.0, 340.0, +1.0, 1.65, 0.50, 0.0)
// (13.0, 170.0, +1.0, 2.40, 0.40, 1.25)
// (6.0, 80.0, -1.0, 3.65, 0.35, 2.60)
// (2.5, 35.0, +1.0, 5.80, 0.25, 0.85)

function gerstnerPoint(x, t) {
  const k1 = 0.01847995;
  const k2 = 0.03695991;
  const k3 = 0.07853982;
  const k4 = 0.17951958;

  const theta1 = (k1 * 1.0 * x) - (1.65 * t) + 0.0;
  const sin1 = Math.sin(theta1);
  const cos1 = Math.cos(theta1);
  const dx1 = -0.50 * 26.0 * 1.0 * sin1;
  const dy1 = 26.0 * cos1;

  const theta2 = (k2 * 1.0 * x) - (2.40 * t) + 1.25;
  const sin2 = Math.sin(theta2);
  const cos2 = Math.cos(theta2);
  const dx2 = -0.40 * 13.0 * 1.0 * sin2;
  const dy2 = 13.0 * cos2;

  const theta3 = (k3 * -1.0 * x) - (3.65 * t) + 2.60;
  const sin3 = Math.sin(theta3);
  const cos3 = Math.cos(theta3);
  const dx3 = -0.35 * 6.0 * -1.0 * sin3;
  const dy3 = 6.0 * cos3;

  const theta4 = (k4 * 1.0 * x) - (5.80 * t) + 0.85;
  const sin4 = Math.sin(theta4);
  const cos4 = Math.cos(theta4);
  const dx4 = -0.25 * 2.5 * 1.0 * sin4;
  const dy4 = 2.5 * cos4;

  const xPrime = x + (dx1 + dx2 + dx3 + dx4);
  const y = dy1 + dy2 + dy3 + dy4;
  return [xPrime, y];
}
