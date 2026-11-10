/** Colour names used in the catalogue -> a swatch. Unknown names simply get no dot. */
const dots: Record<string, string> = {
  'trắng': '#ffffff', 'đen': '#1b1a17', 'xám': '#9ca3af', 'xám than': '#4b5563', 'xám melange': '#b8b8c4', 'be': '#d9c9a8', 'nâu': '#7a5a3a',
  'xanh navy': '#1f2a44', 'xanh nhạt': '#bcd0e3', 'xanh đậm': '#27406b', 'xanh rêu': '#4f5d3a', 'xanh': '#3b6ea5', 'xanh indigo': '#3f4a8a',
  'đỏ': '#c0392b', 'đỏ đô': '#7b1e2b', 'hồng': '#f4a6c0', 'tím': '#7c3aed', 'vàng': '#e9b949', 'kem': '#f3ead7', 'ghi': '#8f949a',
};

export const colorDot = (name: string) => dots[name.trim().toLowerCase()];
