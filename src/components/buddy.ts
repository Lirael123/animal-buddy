/**
 * 粉红小兔（Rex）SVG 组件。
 * size: 宽度像素；mood: 用于切换表情（默认开心）。
 */
export function buddySVG({
  size = 160,
  mood = 'happy',
}: { size?: number; mood?: 'happy' | 'talk' | 'listen' } = {}): string {
  const eyesHappy =
    mood === 'happy'
      ? '<circle cx="685" cy="612" r="14" fill="#4a3f5c"/><circle cx="815" cy="612" r="14" fill="#4a3f5c"/>'
      : mood === 'listen'
        ? '<ellipse cx="685" cy="612" rx="16" ry="20" fill="#4a3f5c"/><ellipse cx="815" cy="612" rx="16" ry="20" fill="#4a3f5c"/><circle cx="692" cy="602" r="5" fill="#fff"/><circle cx="822" cy="602" r="5" fill="#fff"/>'
        : // talk：弯弯眯眼
          '<path d="M672 606 q13 -12 26 0" stroke="#4a3f5c" stroke-width="8" stroke-linecap="round" fill="none"/><path d="M802 606 q13 -12 26 0" stroke="#4a3f5c" stroke-width="8" stroke-linecap="round" fill="none"/>';

  const mouthHappy =
    mood === 'talk'
      ? '<path d="M710 672 q40 42 80 0" stroke="#c85a74" stroke-width="10" stroke-linecap="round" fill="none"/>'
      : '<path d="M715 665 q35 24 70 0 q-6 22 -35 22 q-29 0 -35 -22z" fill="#c85a74"/>';

  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 1400" width="${size}" height="${Math.round((size * 1400) / 1500)}" focusable="false" aria-hidden="true">
    <g id="rabbit">
      <ellipse cx="750" cy="1180" rx="330" ry="90" fill="#ffd9b0" opacity="0.5"/>
      <ellipse cx="750" cy="1080" rx="330" ry="300" fill="#f8bbd0"/>
      <ellipse cx="750" cy="1040" rx="210" ry="230" fill="#fbd3e3"/>
      <ellipse cx="600" cy="1180" rx="120" ry="130" fill="#f8bbd0"/>
      <circle cx="590" cy="1330" r="44" fill="#f8bbd0"/>
      <ellipse cx="900" cy="1180" rx="120" ry="130" fill="#f8bbd0"/>
      <circle cx="910" cy="1330" r="44" fill="#f8bbd0"/>
      <!-- 左耳 -->
      <ellipse cx="560" cy="300" rx="95" ry="240" fill="#f8bbd0" transform="rotate(-18 560 300)"/>
      <ellipse cx="560" cy="300" rx="52" ry="190" fill="#fd9fc0" transform="rotate(-18 560 300)"/>
      <!-- 右耳 -->
      <ellipse cx="950" cy="300" rx="95" ry="240" fill="#f8bbd0" transform="rotate(18 950 300)"/>
      <ellipse cx="950" cy="300" rx="52" ry="190" fill="#fd9fc0" transform="rotate(18 950 300)"/>
      <!-- 头 -->
      <ellipse cx="750" cy="600" rx="345" ry="300" fill="#f8bbd0"/>
      <!-- 腮红 -->
      <circle cx="600" cy="690" r="46" fill="#fd9fc0" opacity="0.7"/>
      <circle cx="900" cy="690" r="46" fill="#fd9fc0" opacity="0.7"/>
      <!-- 鼻 -->
      <ellipse cx="750" cy="650" rx="26" ry="20" fill="#e87998"/>
      <!-- 眼睛与嘴 -->
      ${eyesHappy}
      ${mouthHappy}
    </g>
  </svg>`;
}