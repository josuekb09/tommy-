# Tommy enclosure V1: design calculations and print guide

Status: **V1 estimate, designed around real datasheet sizes.** The geometry is checked by software (valid solids, zero collisions between parts and walls). It has **not** been test-printed, so print the two small fit plates first (1 hour total). Everything is parametric in `Tommy-enclosure.scad`: change a number, re-export.

## Parts the box is built around
| Part | Size used (mm) | Source |
|---|---|---|
| Waveshare ESP32-S3-Touch-LCD-5 / 5B (standard version) | 112.4 x 75.1, thickness 20 (estimate) | Waveshare datasheet (outline). **Thickness: measure** |
| Screen window | 108 x 64 (5 in panel active area, about) | verify against the real glass |
| WS2812 24-LED ring | any ring up to 95 dia, 8 thick | verify the ring you buy |
| Frosted/opal acrylic disc | 100 dia x 3 | cut to order |
| Speaker | 40 dia x 15 | verify |
| LiPo, 903450 class | bay 52 x 36 x 10 | verify |
| MAX98357A breakout | bay 20 x 18 x 8 | Adafruit board is about 19 x 17.8 |
| USB-C panel-mount cable | opening 14 x 8 | adjust to the part |

## The calculations
- **Width** = widest part (board 112.4) + 2 x (board clearance 1.0 + wall 2.5 + holder wall 2.0) = **123.4**.
- **Height 160, depth 120 (+5.5 panel = 125.5), slope 70 degrees.** Slope length 170.3; the board sits in the upper part with 14 mm to the top edge.
- **Board pocket** 114.4 x 77.1 (1 mm each side). Window lip left on the glass: 2.2 mm at the sides, 5.5 mm top and bottom.
- **Light disc**: seat 101 dia x 3, window 92 dia, light-shield collar 104.2 outer x 12 long, centred at 80 mm height.
- **Clearance between the board holder and the light-disc collar: 30.9 mm.** (This is why depth 120 works; a smaller box is possible, but the speaker and battery then need re-spacing.)
- **Floor layout** (no overlaps, checked in software): speaker centred 36 mm from the front; battery bay at the rear, 36 wide, centred; amp board beside it (offset 22 to 40 mm to the side).
- **Material and time (rough, slicer dependent):** shell 110 cm3 and back panel 73 cm3 of solid; with 3 walls and 15 to 20 % infill, about 150 to 230 g of PLA in total and roughly 12 to 20 hours of printing for both.

## Printer requirements
- Build volume at least **165 x 130 x 165 mm** (the shell stands 160 mm tall; the back panel lies flat, 160 x 123).
- Supports: tree supports under the roof and under the 4 screw posts. The sloped front (70 degrees) prints without support.
- PLA is fine for a prototype; PETG is better for long use. Layer height 0.2, 3 walls.

## What changes in the shopping list (from the datasheet)
1. **No separate TP4056 charger is needed.** The Waveshare board has a battery charger and a 5 V boost on board (MX1.25 connector). Remove that part from the list.
2. **Battery:** a single 3.7 V cell, the datasheet recommends 2000 mAh or less, with an **MX1.25 plug**. Check polarity before connecting: some packs are wired the opposite way and can damage the board.
3. **Runtime:** the board alone draws about 450 mA at 5 V. With the LED ring and audio, a 2000 mAh cell gives roughly 1.5 to 2 hours (my estimate). For a 3-hour meeting, power it from USB-C (power bank or wall adapter) and treat the battery as a backup.
4. **Pins (for the engineer):** the 5 in screen uses almost every GPIO; only GPIO6 is free. GPIO 11 to 13 (SD card), 15 and 16 (CAN) and 43 and 44 (RS485) can be reused for the LED data line and the I2S audio if those features are not used.
5. Keep metal away from the board's PCB antenna.

## Step by step
1. Buy the parts. Measure the real board thickness, the LED ring, the speaker and the battery with calipers.
2. Print **fitplate 1 (board)**: the real board must drop into the pocket and the screen must line up with the window. Print **fitplate 2**: speaker, battery and amp go in their holes.
3. If anything is off, edit that number at the top of the .scad file and re-export. Set `dims_verified = true` to remove the "V1 EST" mark under the floor.
4. Print the shell and the back panel. Glue the acrylic into its seat, tape the LED ring to its back, hold the display with double-sided foam tape around the window, and close the back with 4 M3 screws.

## Not modelled yet
Rubber feet, cable strain relief, a vibration-motor mount, exact screw holes of the display, and the cut-outs for the board's own USB-C and SD slot (the design uses a panel-mount USB-C cable instead).
