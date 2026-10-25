// =====================================================================
// TOMMY enclosure V1: parametric (OpenSCAD, free: openscad.org). mm.
// Designed around: Waveshare ESP32-S3-Touch-LCD-5 / 5B (112.4 x 75.1 mm),
// 24-LED WS2812 ring, 40 mm speaker, MAX98357A, 1 LiPo cell, 100 mm acrylic.
//
// "VERIFY" = taken from a datasheet or typical part and must be confirmed
// with calipers when the real part arrives. Print the two FIT PLATES first.
//
//   openscad -D 'part="fitplate_board"' -o fitplate_board.stl Tommy-enclosure.scad
//   openscad -D 'part="fitplate_small"' -o fitplate_small.stl Tommy-enclosure.scad
//   openscad -D 'part="shell"'          -o shell.stl          Tommy-enclosure.scad
//   openscad -D 'part="back"'           -o back.stl           Tommy-enclosure.scad
// =====================================================================

part = "assembly";   // assembly | shell | back | fitplate_board | fitplate_small | ghosts
dims_verified = false;   // set true after both fit plates passed (removes the V1 mark)
show_parts = true;

// ---------- printing ----------
clr       = 0.5;   // fit clearance per side, small parts
clr_board = 1.0;   // clearance per side around the display board (extra safety)
wall      = 2.5;
$fn       = 72;

// ---------- overall shape ----------
H    = 160;   // back height
D    = 120;   // depth (front to rear opening)
tilt = 70;    // screen angle from horizontal (70 = nearly upright, easy to read)

// ---------- display board: Waveshare ESP32-S3-Touch-LCD-5 / 5B ----------
board_w = 112.4;  // across (datasheet: 112.4 x 75.1 mm, standard version)
board_h = 75.1;   // along the slope
board_t = 20;     // VERIFY: total thickness incl. terminal blocks (estimate)
view_w  = 108;    // visible screen area, about 108 x 64 mm for a 5 in panel (VERIFY)
view_h  = 64;
view_off = 0;     // VERIFY: shift window along the slope if the screen is off-centre
frame_w = 2;

// ---------- light disc ----------
ring_od = 70;     // max LED ring diameter this design takes is 95 (VERIFY ring)
ring_t  = 8;      // ring thickness incl. LEDs and soldered wires
diff_d  = 100;    // opal/frosted acrylic disc diameter
diff_t  = 3;
collar_len = ring_t + 4;   // light-shield collar behind the diffuser
ring_z_off = 0;

// ---------- other parts ----------
spk_d = 40;  spk_t = 15;  spk_x = 36;   // speaker (VERIFY)
bat_l = 52;  bat_w = 36;  bat_t = 10;   // LiPo 903450-class, room for 2000-2500 mAh (VERIFY)
amp_l = 20;  amp_w = 18;  amp_t = 8;    // MAX98357A breakout with pins
usb_w = 14;  usb_h = 8;   usb_y = 0;    // opening for a panel-mount USB-C cable
sw_w = 12.5; sw_h = 6.5;                // slide switch hole (optional)
screw_d = 2.8;

// ---------- derived ----------
top = H / tan(tilt);
L   = H / sin(tilt);
W   = max(board_w, diff_d) + 2*(clr_board + wall + frame_w);
p   = diff_t + 2.5;
zc  = H/2 + ring_z_off;
u_c = L - (board_h/2 + 14);

// ---------- sanity checks ----------
assert(top < D - 20, "Slope too shallow for this depth");
assert(diff_d >= ring_od + 4, "Diffuser must be larger than the LED ring");
assert(zc - diff_d/2 > wall + 2 && zc + diff_d/2 < H - wall - 2, "Light disc does not fit the height");
assert(spk_x + spk_d/2 + clr + 3 + 4 < D - 4 - bat_l, "Speaker and battery overlap on the floor");
assert(bat_w/2 + clr < 22, "Battery overlaps the amp bay");
echo(str("Outer W x D x H = ", W, " x ", D + p, " x ", H, " mm"));
if (!dims_verified) echo("NOTE: V1 estimate. Print the fit plates before the final parts.");

module profile(d, h, t) polygon([[0,0],[d,0],[d,h],[t,h]]);
module extr() rotate([90,0,0]) linear_extrude(height=W, center=true) children();
module on_slope(u) rotate([0,-tilt,0]) translate([u,0,0]) children();

post_y  = W/2 - wall - 3.2;
post_zs = [wall + 3.2, H - wall - 3.2];

module shell() {
  difference() {
    union() {
      difference() {
        extr() profile(D, H, top);
        extr() union() {
          offset(delta=-wall) profile(D, H, top);
          translate([D-wall-0.5, wall]) square([wall+1, H-2*wall]);
        }
      }
      // board holder frame
      on_slope(u_c) difference() {
        translate([-(board_h/2+clr_board+frame_w), -(board_w/2+clr_board+frame_w), -(wall+board_t+clr_board+2)])
          cube([board_h+2*clr_board+2*frame_w, board_w+2*clr_board+2*frame_w, board_t+clr_board+2+0.01]);
        translate([-(board_h/2+clr_board), -(board_w/2+clr_board), -(wall+board_t+clr_board+3)])
          cube([board_h+2*clr_board, board_w+2*clr_board, board_t+clr_board+3+wall]);
      }
      for (sy=[-1,1], z=post_zs)
        translate([D-14, sy*post_y, z]) rotate([0,90,0]) cylinder(h=14, d=8);
      translate([spk_x, 0, wall-0.01]) difference() {
        cylinder(h=4, d=spk_d+2*clr+3);
        cylinder(h=5, d=spk_d+2*clr);
      }
    }
    on_slope(u_c) translate([view_off - view_h/2, -view_w/2, -wall-1]) cube([view_h, view_w, wall+3]);
    for (sy=[-1,1], z=post_zs)
      translate([D-14.1, sy*post_y, z]) rotate([0,90,0]) cylinder(h=14.2, d=screw_d);
    for (r=[0:3]) for (a=[0:30:330])
      if (r>0 || a==0) translate([spk_x + r*5*cos(a), r*5*sin(a), -1]) cylinder(h=wall+6, d=2.2, $fn=16);
    translate([D-35, W/2-wall-1, wall+12]) cube([sw_w, wall+2, sw_h]);
    if (!dims_verified)
      translate([D/2, 0, -0.01]) mirror([1,0,0]) linear_extrude(0.6)
        text("V1 EST", size=6, halign="center", valign="center");
  }
}

module back_panel() {
  difference() {
    union() {
      translate([D, -W/2, 0]) cube([p, W, H]);
      translate([D-collar_len, 0, zc]) rotate([0,90,0])
        difference() {
          cylinder(h=collar_len+0.01, d=diff_d+2*clr+3.2);
          translate([0,0,-0.1]) cylinder(h=collar_len+0.3, d=diff_d+2*clr);
        }
    }
    translate([D-0.01, 0, zc]) rotate([0,90,0]) cylinder(h=diff_t+0.01, d=diff_d+2*clr);
    translate([D-0.5, 0, zc]) rotate([0,90,0]) cylinder(h=p+1, d=diff_d-8);
    for (sy=[-1,1], z=post_zs)
      translate([D-1, sy*post_y, z]) rotate([0,90,0]) cylinder(h=p+2, d=3.2);
    translate([D-1, usb_y - usb_w/2, wall+9]) cube([p+2, usb_w, usb_h]);
  }
}

// Test print 1: the front bezel with the real board pocket and screen window
module fitplate_board() {
  pw = board_w + 2*(clr_board + frame_w); ph = board_h + 2*(clr_board + frame_w);
  difference() {
    union() {
      translate([-(pw+8)/2, -(ph+8)/2, 0]) cube([pw+8, ph+8, wall]);
      translate([-pw/2, -ph/2, 0]) cube([pw, ph, wall+6]);
    }
    translate([-(board_w+2*clr_board)/2, -(board_h+2*clr_board)/2, wall]) cube([board_w+2*clr_board, board_h+2*clr_board, 7]);
    translate([-view_w/2, view_off - view_h/2, -1]) cube([view_w, view_h, wall+2]);
  }
}

// Test print 2: speaker, battery and amp holes
module fitplate_small() {
  items = [["SPEAKER", spk_d, spk_d, 1], ["BATTERY", bat_l, bat_w, 0], ["AMP", amp_l, amp_w, 0]];
  gap = 8; pw = max([for (i=items) i[1]]) + 2*clr + 2*gap;
  hs = [for (i=items) i[2] + 2*clr + gap + 6];
  ph = gap + sum(hs, len(items));
  difference() {
    cube([pw, ph, 3]);
    for (k=[0:len(items)-1]) {
      y0 = gap + sum(hs, k) + (items[k][2]+2*clr)/2 + 6;
      translate([pw/2, y0, -1]) {
        if (items[k][3]==1) cylinder(h=5, d=items[k][1]+2*clr);
        else translate([-(items[k][1]+2*clr)/2, -(items[k][2]+2*clr)/2, 0])
               cube([items[k][1]+2*clr, items[k][2]+2*clr, 5]);
      }
    }
  }
  for (k=[0:len(items)-1])
    translate([3, gap + sum(hs, k), 3]) linear_extrude(0.6) text(items[k][0], size=3.5);
}
function sum(v, n, i=0) = i>=n ? 0 : v[i] + sum(v, n, i+1);

module ghosts() {
  color("dimgray", 0.5) on_slope(u_c) translate([-board_h/2, -board_w/2, -wall-board_t]) cube([board_h, board_w, board_t]);
  color("green", 0.5) translate([D-4-bat_l, -bat_w/2, wall+0.5]) cube([bat_l, bat_w, bat_t]);
  color("orange", 0.5) translate([spk_x, 0, wall+0.5]) cylinder(h=spk_t, d=spk_d);
  color("red", 0.5) translate([D-6-amp_l, 22, wall+0.5]) cube([amp_l, amp_w, amp_t]);
  color("white", 0.7) translate([D+0.1, 0, zc]) rotate([0,90,0]) cylinder(h=diff_t, d=diff_d);
  color("yellow", 0.6) translate([D-ring_t, 0, zc]) rotate([0,90,0]) cylinder(h=ring_t, d=ring_od);
}

if (part == "shell") shell();
else if (part == "back") rotate([0,90,0]) translate([-D-p, 0, 0]) back_panel();
else if (part == "fitplate_board") fitplate_board();
else if (part == "fitplate_small") fitplate_small();
else if (part == "ghosts") ghosts();
else if (part == "back_assembled") back_panel();
else { shell(); back_panel(); if (show_parts) ghosts(); }
