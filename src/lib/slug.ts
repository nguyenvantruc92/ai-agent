/** "Áo sơ mi Oxford" -> "ao-so-mi-oxford". Falls back to "khac" when nothing usable remains. */
export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'khac';
}
