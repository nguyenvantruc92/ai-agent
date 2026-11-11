# Third-party notices

## TailAdmin (free React Tailwind admin dashboard)

The admin interface reuses design tokens, CSS utilities and UI primitives from
[TailAdmin](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard), ported from its React/Vite
code to Next.js: `src/components/admin-ui/**`, the `menu-item` / scrollbar / ApexCharts rules in `src/app/globals.css`
and `src/lib/cn.ts`.

MIT License — Copyright (c) 2023 TailAdmin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Demo product photos (Unsplash)

The main image of every demo product (`data/seed/product-images/<CODE>.webp`) is a photo from [Unsplash](https://unsplash.com), used under the
[Unsplash License](https://unsplash.com/license) (free for commercial use, no attribution required; credited here anyway). Images are cropped to 4:5 and
re-encoded as WebP by `scripts/fetch-product-images.py` from the picks in `scripts/product-image-picks.json`. They are stock photos that approximate each
product (type and colour), not photos of real merchandise. The category tiles on the home page (`src/assets/categories/<slug>.webp`, mapped in
`src/lib/category-images.ts`) reuse some of these photos: ao-so-mi = SM-002, ao-polo = PL-003, ao-thun = TS-001, ao-len = KN-002, ao-khoac = JK-003,
quan-chinos = QT-001, quan-tay = QT-003, quan-jeans = QT-005, quan-jogger = QT-007, quan-short = QT-008, phu-kien = PK-001.

| Product | Photo | Photographer |
|---|---|---|
| SM-001 | [20oegq2JDYU](https://unsplash.com/photos/man-in-white-dress-shirt-and-blue-denim-jeans-20oegq2JDYU) | [Jeremy McGilvrey](https://unsplash.com/@jeremy_mcgilvrey) |
| SM-002 | [HGqPrIJAOBY](https://unsplash.com/photos/a-blue-shirt-hanging-on-a-wooden-stand-HGqPrIJAOBY) | [Neakasa](https://unsplash.com/@neakasa) |
| SM-003 | [S4f4apZd-hA](https://unsplash.com/photos/a-white-shirt-hanging-on-a-clothes-line-S4f4apZd-hA) | [tian dayong](https://unsplash.com/@tonnnyj) |
| SM-004 | [BFcyOTX3kXo](https://unsplash.com/photos/man-in-green-button-up-long-sleeve-shirt-holding-black-smartphone-BFcyOTX3kXo) | [Mitsuo JR](https://unsplash.com/@mitsuojunior) |
| SM-005 | [XrwQdYbvvao](https://unsplash.com/photos/a-man-standing-outside-XrwQdYbvvao) | [Yen Sheikh](https://unsplash.com/@yensheikh) |
| SM-006 | [NsVzWhy9Qac](https://unsplash.com/photos/smiling-man-in-denim-shirt-NsVzWhy9Qac) | [Ernest Flowers](https://unsplash.com/@ernestflowerss) |
| SM-007 | [bGg3BbYfNBY](https://unsplash.com/photos/man-in-blue-and-white-plaid-dress-shirt-bGg3BbYfNBY) | [Joseph Karges](https://unsplash.com/@freedomphotos) |
| SM-008 | [iyYMv9GCyAY](https://unsplash.com/photos/young-man-in-black-shirt-with-hands-behind-his-neck-iyYMv9GCyAY) | [Farhan Chohan](https://unsplash.com/@farhanchohan) |
| TS-001 | [fiA7sq2PdnQ](https://unsplash.com/photos/a-white-t-shirt-hanging-on-a-white-wall-fiA7sq2PdnQ) | [Jonathan Mattson](https://unsplash.com/@jonathan_mg) |
| TS-002 | [pYDQyzThtLE](https://unsplash.com/photos/a-young-man-standing-on-a-skateboard-on-a-city-street-pYDQyzThtLE) | [Tim Bernhard](https://unsplash.com/@bernhardvisuals) |
| TS-003 | [RfL7v_g5Fbs](https://unsplash.com/photos/man-with-beard-touching-his-chin-thoughtfully-RfL7v_g5Fbs) | [abolfazl babaei](https://unsplash.com/@aban_pics) |
| TS-004 | [314VZQb3G_8](https://unsplash.com/photos/man-in-black-crew-neck-t-shirt-and-black-pants-standing-beside-white-wall-314VZQb3G_8) | [Lucas Lenzi](https://unsplash.com/@lucaslenzi) |
| TS-005 | [8UsQoiJLNNQ](https://unsplash.com/photos/a-blue-shirt-hanging-on-a-clothes-line-8UsQoiJLNNQ) | [tian dayong](https://unsplash.com/@tonnnyj) |
| PL-001 | [f67Caxg3akg](https://unsplash.com/photos/man-in-black-polo-shirt-f67Caxg3akg) | [Clément Vatte](https://unsplash.com/@clement_vatte) |
| PL-002 | [Fp1pb_cqlNM](https://unsplash.com/photos/a-man-sitting-on-a-stool-Fp1pb_cqlNM) | [Mediamodifier](https://unsplash.com/@mediamodifier) |
| PL-003 | [fMgF6k7QLFc](https://unsplash.com/photos/man-in-blue-polo-shirt-standing-during-daytime-fMgF6k7QLFc) | [Muhammad Abdullah](https://unsplash.com/@abdullah_photography) |
| PL-004 | [hZlTU_ViPCs](https://unsplash.com/photos/man-in-tan-polo-shirt-and-black-pants-looking-away-hZlTU_ViPCs) | [Les Taylor](https://unsplash.com/@les_photograph) |
| PL-005 | [dx5OMBDUVrU](https://unsplash.com/photos/a-man-wearing-sunglasses-and-a-grey-shirt-dx5OMBDUVrU) | [Jamshaid Mughal](https://unsplash.com/@jamshaid_pro) |
| PL-006 | [jK9ZavfMu50](https://unsplash.com/photos/a-man-sitting-at-a-table-with-a-drink-in-his-hand-jK9ZavfMu50) | [Rupinder Singh](https://unsplash.com/@singhrupinder) |
| QT-001 | [9GqMLuNFWCw](https://unsplash.com/photos/a-stylish-man-poses-with-folded-arms-9GqMLuNFWCw) | [Faizan Bhadarka](https://unsplash.com/@faizan223) |
| QT-002 | [r5jJ9Aftyz8](https://unsplash.com/photos/a-man-standing-with-his-hands-in-his-pockets-r5jJ9Aftyz8) | [Joel Muniz](https://unsplash.com/@jmuniz) |
| QT-003 | [vS0Kya7E5V4](https://unsplash.com/photos/man-in-black-suit-jacket-and-black-pants-standing-on-gray-concrete-floor-during-daytime-vS0Kya7E5V4) | [Mohamad Khosravi](https://unsplash.com/@mohamadkhosravi) |
| QT-004 | [Vz3nbmArkfA](https://unsplash.com/photos/man-in-dark-grey-suit-Vz3nbmArkfA) | [ALIREZA Pandkhahi](https://unsplash.com/@kroba313) |
| QT-005 | [YeGao3uk8kI](https://unsplash.com/photos/blue-denim-jeans-on-white-textile-YeGao3uk8kI) | [Matthew Moloney](https://unsplash.com/@mattmoloney) |
| QT-006 | [EtOMMg1nSR8](https://unsplash.com/photos/blue-denim-jeans-on-brown-clothes-hanger-EtOMMg1nSR8) | [Jason Leung](https://unsplash.com/@ninjason) |
| QT-007 | [A3RJnU1OqrM](https://unsplash.com/photos/young-man-in-black-tracksuit-and-sneakers-A3RJnU1OqrM) | [Jamar Crable](https://unsplash.com/@kansasphotpgrapherjamar) |
| QT-008 | [ABHLcp7juXU](https://unsplash.com/photos/a-man-standing-next-to-a-swimming-pool-ABHLcp7juXU) | [Nikola](https://unsplash.com/@bynikolavu) |
| QT-009 | [paHs1iV7_Xk](https://unsplash.com/photos/man-wearing-black-athletic-outfit-and-white-sneakers-paHs1iV7_Xk) | [Alexis Maxell](https://unsplash.com/@maxellalexis) |
| JK-001 | [QezsAWi39Gw](https://unsplash.com/photos/a-man-in-a-black-jacket-QezsAWi39Gw) | [Josh Batres](https://unsplash.com/@joshgt90) |
| JK-002 | [lo3pH83mFx4](https://unsplash.com/photos/man-in-black-turtleneck-long-sleeve-shirt-lo3pH83mFx4) | [Bulbul Ahmed](https://unsplash.com/@bulbul252) |
| JK-003 | [sN9BqTtWJIE](https://unsplash.com/photos/man-in-blue-denim-jacket-and-black-fitted-cap-sN9BqTtWJIE) | [Brock Wegner](https://unsplash.com/@isthatbrock) |
| JK-004 | [yMpZJvTEspk](https://unsplash.com/photos/man-in-gray-suit-jacket-wearing-black-sunglasses-yMpZJvTEspk) | [Mohamad Khosravi](https://unsplash.com/@mohamadkhosravi) |
| KN-001 | [eLc3-OoLuEU](https://unsplash.com/photos/a-persons-leg-with-a-black-and-blue-sock-eLc3-OoLuEU) | [Joshua Thomas](https://unsplash.com/@joshua_thomas19) |
| KN-002 | [6__eMw1z7Sc](https://unsplash.com/photos/a-man-in-a-blue-sweater-and-tie-carrying-a-brown-bag-6__eMw1z7Sc) | [Mohamad Khosravi](https://unsplash.com/@mohamadkhosravi) |
| PK-001 | [rH16wMV8ImM](https://unsplash.com/photos/a-pair-of-brown-leather-belts-sitting-on-top-of-a-white-piece-of-paper-rH16wMV8ImM) | [saeed karimi](https://unsplash.com/@saeedkarimistudio) |
| PK-002 | [ohcZPgCEBqk](https://unsplash.com/photos/a-ring-on-a-table-ohcZPgCEBqk) | [Vetrivel Viswanathar](https://unsplash.com/@vetrivikashviswanathar) |
| PK-003 | [okiWdu6QHew](https://unsplash.com/photos/man-with-mustache-in-patterned-shirt-okiWdu6QHew) | [Will Haddock](https://unsplash.com/@willhaddock) |
| PK-004 | [90kNrvWerXs](https://unsplash.com/photos/a-pair-of-white-sneakers-and-a-pair-of-gray-socks-90kNrvWerXs) | [Anna Evans](https://unsplash.com/@anevans) |

### Home page hero

| Use | Photo | Photographer |
|---|---|---|
| Hero background (`src/assets/hero/hero-bg.webp`) | [TS--uNw-JqE](https://unsplash.com/photos/hanged-top-on-brown-and-white-clothes-horse-TS--uNw-JqE) | [Alyssa Strohmann](https://unsplash.com/@anotherlovely) |
| "NEW" tile (`src/assets/hero/hero-new.webp`) | [R4O8mJeih1w](https://unsplash.com/photos/a-young-man-in-a-white-jacket-and-hat-R4O8mJeih1w) | [Brian Lawson](https://unsplash.com/@visualartery) |
