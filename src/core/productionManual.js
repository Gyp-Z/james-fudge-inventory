// Complete James' Fudge production manual — every recipe, exact scale weight/tare,
// step-by-step cooking process, per-tray topping, batch yield, and ingredient container
// size, plus new-employee tips. Surfaced to Jarvis ON DEMAND via the get_production_manual
// tool (kept OUT of the base SYSTEM_PROMPT so it doesn't cost tokens on every message).
// This is the single source of truth for "how do I make X" answers — update it here when a
// recipe or process changes.

export const PRODUCTION_MANUAL = `# James' Fudge — Complete Production Manual & Training Reference

This is the full guide to making everything at James' Fudge. Use it to train new chefs and answer any production question — recipes, exact scale readings, cooking steps, temperatures, toppings, yields, and supply sizes. Speak casually and clearly; assume the person may have never made fudge before. Walk them through every step when asked.

If someone asks WHERE something is in the kitchen, or anything not covered here, tell them to ask an experienced crew member: Zach, Alex, Grant, Gabe, Aidan, or Lisa (Zach's mom). When in doubt, ask — don't guess.

---

## SCALE TARE WEIGHTS
The scale reading = ingredient weight + the empty container's tare weight.

| Container | Tare Weight | Used For |
|---|---|---|
| Sugar bucket | 0.92 lbs | Sugar, Brown Sugar |
| Small bowl | 0.40 lbs | Invert Sugar, Fondant, Fondex |
| Chocolate/Coconut bucket | 0.14 lbs | Chocolate, Shredded Coconut |

### Quick Reference — What The Scale Should Read
| Ingredient | Recipe Amount | Scale Reads |
|---|---|---|
| Sugar (standard) | 11 lbs | 11.92 |
| Sugar (Maple Walnut, reduced) | 7.42 lbs | 8.34 |
| Sugar (Caramel) | 4.50 lbs | 5.42 |
| Brown Sugar (Maple Walnut) | 3.58 lbs | 4.50 |
| Invert Sugar | 1.02 lbs | 1.42 |
| Fondant | 2.23 lbs | 2.63 |
| Fondex | 0.52 lbs | 0.92 |
| Chocolate | 1.90 lbs | 2.04 |
| Coconut (Shredded) | 1.29 lbs | 1.43 |
| Butter | 2 lbs | 2 sticks (no scale needed) |
| Butter (PB base) | 2.5 lbs | 2.5 sticks |

---

## BATCH YIELDS
| Product | Yield Per Batch |
|---|---|
| Fudge | 3 trays (or 6 half trays) |
| Caramel | 1 tray (cut into 18 squares for Sea Salt Caramel) |
| Caramel Corn | 2.5 barrels |
| Nut Caramel Corn | 2.5 barrels |
| Cheddar Corn | 1 barrel |
| White Cheddar Corn | 1 barrel |
| Kettle Corn | 1 barrel |
| Oreo Popcorn | 1 barrel |

---

## FUDGE COOKING PROCESS (Step by Step)
Standard procedure for every fudge flavor. Flavor-specific variations are noted per flavor in Step 7 and the flavor table.

**Step 1 — Load the Pot (Cold Start).** Add these FIRST, before turning anything on:
- Sugar (scale reads 11.92 for standard batches). For Maple Walnut: use 7.42 lbs sugar (scale 8.34) AND 3.58 lbs brown sugar (scale 4.50).
- Invert Sugar (scale 1.42)
- Heavy Cream (32 oz)
- Water
- Evaporated Milk (3 cups)
Then turn on the agitator, heat, and alarm.

**Step 2 — 160°F: Add Butter.** Cut 2 sticks of butter into 4 pieces each (8 pieces total) and drop them in. (Peanut Butter base: use 2.5 sticks, cut the same way.)

**Step 3 — 212°F: Add Corn Syrup.** Generously spray the inside of a Pyrex measuring cup so the corn syrup doesn't stick, measure 4 cups, and pour it into the pot.

**Step 4 — 220°F: Drip More Evaporated Milk.** Drip a bit more evaporated milk in, then put the lid on and let it cook.

**Step 5 — Wait for 242.5°F.** Use this downtime to prep add-ins: weigh fondant (scale 2.63), fondex (scale 0.92), and any flavor-specific ingredients (chocolate, coconut, peanut butter mixture, etc.). The temp flashes yellow at 242.5°F. NOTE: the alarm is currently broken — constantly monitor the temperature, do NOT walk away.

**Step 6 — 242.5°F: Stop Cooking.** When it flashes yellow at 242.5°F: turn ON the water flush, turn OFF the heat, turn OFF the alarm. Let it cool back down to 220°F.

**Step 7 — 220°F (Cooling): Add the Flavor Ingredients.** Remove the lid, then add by flavor:

- **Vanilla base flavors:** rip up the fondant and add it, add fondex, salt (1/8 cup), vanilla extract (1/6 cup).
- **Chocolate base flavors:** fondant, fondex, salt (1/8 cup), chocolate (scale 2.04). NO vanilla extract.
- **Peanut Butter:** during downtime before 220°F, prep the PB mixture — put half a stick of butter and the peanuts (5 lbs) in the food processor, process until you can't see the top of the gray blade in the middle, salt to taste, pour into a pitcher. At 220°F add fondant, fondex, salt (1/8 cup), the PB mixture from the pitcher, and a splash of vanilla.
- **Chocolate Coconut:** fondant, fondex, salt (1/8 cup), chocolate (scale 2.04), shredded coconut (scale 1.43), vanilla extract (1/6 cup), coconut flavoring (1/6 cup).
- **Chocolate Mint:** fondant, fondex, salt (1/8 cup), chocolate (scale 2.04), mint flavoring (1/6 cup). NO vanilla.
- **Key Lime:** fondant, fondex, salt (1/8 cup), vanilla extract (1/6 cup), key lime flavoring (1/6 cup).
- **Pistachio:** fondant, fondex, salt (1/8 cup), vanilla extract (1/6 cup), pistachio flavoring (1/6 cup), green food coloring (20-30 drops) and teal food coloring (5-10 drops).
- **Chocolate Raspberry (two-pour tray):** make a raspberry batch AND a chocolate batch separately. Raspberry batch = vanilla base with NO vanilla extract; at 220°F add fondant, fondex, salt (1/8 cup), raspberry flavoring (1/6 cup), raspberry food coloring (1/6 cup). Chocolate batch = standard chocolate base. Pour both layers into the tray separately.
- **Chocolate Peanut Butter (two-pour tray):** make a peanut butter batch AND a chocolate batch separately, pour both layers into the tray separately.
- **Snickerdoodle:** make a standard vanilla batch (scale 11.92, same as any vanilla). Make a cinnamon sugar mixture on the side — 1 lb sugar + 0.5 lbs cinnamon, mixed together — and add it right before you pour (not during cooking).
- **Maple Walnut:** uses the brown sugar base (Step 1 variation). At 220°F: fondant, fondex, salt (1/8 cup), vanilla (1/6 cup). Walnuts are added at tray time, not in the pot.

**Step 8 — Pour.** Let the mixture blend with the add-ins in the pot, then pour into trays. For flavors with toppings, add toppings after pouring (see Per-Tray Toppings).

---

## CARAMEL COOKING PROCESS (Step by Step)
Caramel is its own product and also the component inside Sea Salt Caramel fudge. One batch makes 1 tray.

**Step 1 — Load the Pot (Cold Start).** Add everything FIRST: sugar (4.50 lbs, scale 5.42), corn syrup (4 cups — spray the Pyrex generously first). Then turn on the agitator, heat, and alarm.

**Step 2 — 220°F: Drip In the Evaporated Milk.** At 220°F, start dripping in all the evaporated milk (3.5 cups). Keep the temp between 220°F and 225°F while dripping — go slow, don't dump it all at once. Once it's all in, let the temp rise again.

**Step 3 — 242.5°F: Stop Cooking.** When it flashes yellow at 242.5°F: turn ON the water flush, turn OFF the heat, turn OFF the alarm. Let it cool back to 220°F.

**Step 4 — 220°F (Cooling): Add Vanilla.** Add vanilla extract (1/6 cup) and let it mix briefly.

**Step 5 — Pour Immediately.** Spray the tray so the caramel doesn't stick, pour the caramel in, and immediately put the tray on a covered shelf to set and cool.

---

## SEA SALT CARAMEL FUDGE (Vanilla or Chocolate)
A two-component flavor: needs a pre-made caramel tray AND a fudge batch (vanilla or chocolate).

**Prep the caramel layer:** take a completed caramel tray and cut it into 18 squares. For each fudge tray, take one caramel square, microwave it to soften, sprinkle salt on top, and roll it out flat with a rolling pin to fit the fudge tray.

**Assemble:** pour the fudge (vanilla or chocolate base, standard process) into the tray, then layer the rolled-out salted caramel on top.

**Inventory note:** each Sea Salt Caramel fudge tray uses 1/18th of a caramel tray.

---

## FUDGE POPS
Individual fudge portions sold in plastic holders with lids.
1. Pour fudge into a pitcher for controlled pouring.
2. Lay the plastic fudge pop holders (with lids) out on the rack with holes.
3. Pour fudge into each holder — fill about halfway to leave room for toppings in the middle.
4. Add that flavor's toppings into the middle.
5. Fill almost to the brim with the pitcher again.
6. Top with the same toppings that are in the middle.
7. Let them dry for almost a full day.
8. Scrape off any excess fudge from the tops.
9. Add the lids.
10. Use the heat gun to seal them with plastic bands.
11. Put stickers on the front. Done — ready for sale.

(In the inventory app, log fudge pops in the Products tab so the base batch they came from is accounted for — ~20 pops = 1 tray.)

---

## HAND-WRAPPED CARAMELS
Individual wrapped caramel pieces sold as candy.
1. Take a completed caramel tray.
2. Use the two sized rolling cutters to cut it into perfect even pieces.
3. Wrap each piece individually with small plastic wraps.

---

## PER-TRAY TOPPINGS (added after pouring fudge into trays)
| Topping | Qty Per Tray | Used In |
|---|---|---|
| M&Ms | 11.2 oz | Vanilla M&M, Chocolate M&M |
| Reese's Pieces | 11.2 oz | Chocolate Reese's |
| Walnuts | 8 oz | Vanilla Walnut, Chocolate Walnut, Maple Walnut, Chocolate Rocky Road |
| Oreo Pieces | 6.4 oz | Cookies & Cream, Dirt |
| Chocolate Chips | 6.4 oz | Vanilla Chocolate Chip |
| Marshmallows | 17 pieces | Vanilla Marshmallow, Chocolate Marshmallow, Chocolate Rocky Road |

---

## ALL FUDGE FLAVORS — QUICK REFERENCE
| Flavor | Base | Add-Ins at Pot Time | Toppings at Tray Time |
|---|---|---|---|
| Vanilla | Vanilla | — | — |
| Chocolate | Chocolate | — | — |
| Peanut Butter | Peanut Butter | — | — |
| Key Lime | Vanilla (no vanilla extract) | Key Lime Flavoring 1/6 cup | — |
| Pistachio | Vanilla (no vanilla extract) | Pistachio Flavoring 1/6 cup + green food coloring (20-30 drops) + teal food coloring (5-10 drops) | — |
| Snickerdoodle | Vanilla | Cinnamon sugar mixture (1 lb sugar + 0.5 lb cinnamon) added right before pouring | — |
| Chocolate Mint | Chocolate | Mint Flavoring 1/6 cup | — |
| Chocolate Coconut | Chocolate | Coconut 1.29 lbs (scale 1.43) + Coconut Flavoring 1/6 cup + vanilla 1/6 cup | — |
| Maple Walnut | Brown Sugar | — | Walnuts 8 oz/tray |
| Vanilla Sea Salt Caramel | Vanilla | — | Caramel square (microwaved, salted, rolled out) |
| Chocolate Sea Salt Caramel | Chocolate | — | Caramel square (microwaved, salted, rolled out) |
| Chocolate Peanut Butter | PB + Chocolate | Two separate batches, two pours | — |
| Chocolate Raspberry | Raspberry + Chocolate | Two separate batches, two pours | — |
| Vanilla Chocolate Chip | Vanilla | — | Chocolate Chips 6.4 oz/tray |
| Cookies & Cream | Vanilla | — | Oreo Pieces 6.4 oz/tray |
| Vanilla M&M | Vanilla | — | M&Ms 11.2 oz/tray |
| Vanilla Marshmallow | Vanilla | — | Marshmallows 17 pieces/tray |
| Vanilla Walnut | Vanilla | — | Walnuts 8 oz/tray |
| Chocolate M&M | Chocolate | — | M&Ms 11.2 oz/tray |
| Chocolate Marshmallow | Chocolate | — | Marshmallows 17 pieces/tray |
| Chocolate Walnut | Chocolate | — | Walnuts 8 oz/tray |
| Chocolate Reese's | Chocolate | — | Reese's Pieces 11.2 oz/tray |
| Dirt | Chocolate | — | Oreo Pieces 6.4 oz/tray |
| Chocolate Rocky Road | Chocolate | — | Walnuts 8 oz + Marshmallows 17 pieces/tray |

---

## POPCORN PRODUCTION

### Caramel Corn (per batch — yields 2.5 barrels)
1. **Pop the popcorn:** pop 3 batches using caramel kernels in the popcorn machine. Fill 3 barrels full, plus a little in a 4th barrel (less than a quarter full).
2. **Load the caramel machine:** 2 scoops of sugar, just about 2 scoops of brown sugar, 1 stick of butter, 3 bags of corn treats, and fill the liter container to the line with water.
3. **Cook the caramel:** the machine beeps at 355°F. It may beep more than once — only turn off the heat and add popcorn once the temperature rises to 270°F AFTER it beeps.
4. **Add the popcorn:** take off the lid, shake the evaporated water back into the tumbler, remove the lid fully, add the 3-and-a-bit barrels of popcorn, and let it mix/tumble ~3 minutes (constantly monitor).
5. **Dump and cool:** dump into the vat and mix immediately so it doesn't clump. There's a LOT of core heat — keep mixing until it cools and stops sticking.

### Nut Caramel Corn (per batch — yields 2.5 barrels)
Same exact process as Caramel Corn, with one addition: after filling the barrels with fresh popcorn (Step 1), put 3 scoops of the nut mixture on top of the barrels before loading into the caramel machine. Everything else is identical.

### Cheddar Corn (per batch — yields 1 barrel)
1. **Pop the popcorn:** pop 1 batch using cheddar kernels with popcorn salt. Fill 1 barrel full plus a little in a second (less than a quarter full).
2. **Load the tumbler:** add the barrel-and-a-bit of popcorn into the tumbler.
3. **Prepare the cheese mix:** weigh out orange cheddar mix to exactly 3 lbs of actual cheese (account for the bowl's weight). Set the bowl on the mini stove over a pot of water (double boiler / steam method), turn the stove to 425°F, let the water boil, and stir generously with a spatula until the mix is basically liquid with no clumps.
4. **Coat the popcorn:** once fully liquid, turn off the heat, take the bowl off, and slowly pour the cheddar mix into the tumbler until fully coated. Let it tumble a few minutes until dry.

⚠️ ORDER NOTE: You can make White Cheddar BEFORE Orange Cheddar, but NEVER Orange before White — the tumbler's orange residue will tint the white cheddar. Always do white first if making both.

### White Cheddar Corn (per batch — yields 1 barrel)
Exact same process as Cheddar Corn, but use white cheddar mix instead of orange. Same 3 lbs, same steam-melt process, same tumbler. Always make White Cheddar BEFORE Orange Cheddar if doing both in one session.

### Kettle Corn (per batch — yields 1 barrel)
1. **Pop the popcorn:** use a mix of a bit of caramel kernels and a bit of cheddar kernels. Do NOT add popcorn salt to the machine for kettle corn. Once you hear the first pop, add the kettle mix into the machine — it pops together with the kernels.
2. **Dump and season:** dump into the vat, salt with popcorn salt AFTER dumping, and mix so it doesn't stick.

⚠️ CLEANING NOTE: After Kettle Corn you must pop a cleaning batch through the machine before other flavors, to clear the kettle residue. Exception: caramel kernels are fine to pop right after kettle (they're going to be sweet anyway).

### Oreo Popcorn (per batch — yields 1 barrel)
1. **Pop the popcorn:** pop 1 batch using cheddar kernels with popcorn salt. Fill 1 barrel full plus a little in a second (same amount as cheddar corn).
2. **Load the tumbler:** add the barrel-and-a-bit into the tumbler (same tumbler as cheddar corn).
3. **Prepare the sweet cream:** the Oreo Popcorn Kit box has 3 things — a bag of sweet cream, a bag of oreo dust, and a bag of oreo medium pieces. Put the sweet cream in a pitcher, microwave 1 minute, and stir so there's no oil separation on top.
4. **Coat and add toppings:** slowly pour the sweet cream into the tumbler, add the oreo dust, add about half the bag of oreo medium pieces, and let it tumble until dry.
5. **Use leftover oreo pieces:** there will always be extra oreo medium pieces — put them with the oreo pieces used for fudge toppings. No waste.

### Popcorn Order of Operations (if making multiple in one session)
1. White Cheddar (always before orange)
2. Cheddar (orange)
3. Oreo Popcorn (same tumbler as cheddar — clean between if needed)
4. Kettle Corn (requires a cleaning batch after)
5. Caramel Corn / Nut Caramel Corn (own machine, can go anytime; fine to pop caramel kernels after kettle)

---

## CONTAINER / DELIVERY SIZES (for inventory)
The sizes ingredients arrive in when ordered.

| Ingredient | Container Unit | Size |
|---|---|---|
| Sugar | 1 bag | 50 lbs |
| Brown Sugar | 1 bag | 50 lbs |
| Butter | 1 stick | 1 lb |
| Invert Sugar | 1 barrel | 58 lbs |
| Heavy Cream | 1 carton | 32 oz |
| Evaporated Milk | 1 can | 12.125 cups |
| Corn Syrup | 1 barrel | 80 cups |
| Fondant | 1 box | 50 lbs |
| Fondex | 1 barrel | 15 lbs |
| Vanilla Extract | 1 container | 16 cups |
| Chocolate | 1 box | 50 lbs |
| Peanuts | 1 box | 15 lbs |
| Walnuts | 1 box | 400 oz (25 lbs) |
| M&Ms | 1 box | 400 oz (25 lbs) |
| Reese's Pieces | 1 box | 400 oz (25 lbs) |
| Oreo Pieces | 1 box | 400 oz (25 lbs) |
| Chocolate Chips | 1 box | 800 oz |
| Marshmallows | 1 bag | 40 pieces |
| Almonds | 1 box | 25 lbs |
| Cashews | 1 box | 15 lbs |
| Coconut (Shredded) | 1 box | 25 lbs |
| Caramel Kernels | 1 bag | 800 oz |
| Cheddar Kernels | 1 bag | 800 oz |
| Corn Treats | 1 box | 12 bags |
| Orange Cheddar Mix | 1 barrel | 13.6 L |
| White Cheddar Mix | 1 barrel | 13.6 L |
| Oreo Popcorn Kit | 1 box | 4 batches |
| Popcorn Salt | 1 container | 4 lbs |
| Kettle Mix | 1 carton | 3.25 lbs |
| Salt | 1 container | (size TBD) |
| Key Lime Flavoring | 1 bottle | (size TBD) |
| Pistachio Flavoring | 1 bottle | (size TBD) |
| Mint Flavoring | 1 bottle | (size TBD) |
| Coconut Flavoring | 1 bottle | (size TBD) |
| Raspberry Flavoring | 1 bottle | (size TBD) |
| Raspberry Food Coloring | 1 bottle | (size TBD) |
| Green Food Coloring | 1 bottle | (size TBD) |
| Teal Food Coloring | 1 bottle | (size TBD) |
| Cinnamon | 1 container | (size TBD) |

---

## TIPS FOR NEW EMPLOYEES
1. Always constantly monitor the temperature. The alarm is currently broken. Do not walk away from the pot.
2. Prep your add-ins while waiting for 242.5°F — weigh fondant, fondex, chocolate, make the PB mixture, etc.
3. Spray your Pyrex before measuring corn syrup or it'll stick to the glass.
4. Spray caramel trays before pouring caramel or it'll stick.
5. Caramel corn has serious core heat — when you dump it in the vat, keep mixing until it cools and stops sticking. Don't leave it sitting.
6. Two-pour flavors (Chocolate PB, Chocolate Raspberry) require two completely separate batches layered in the same tray.
7. Snickerdoodle cinnamon sugar mixture goes in right before pouring — not during cooking.
8. Sea Salt Caramel needs pre-made caramel: cut the tray into 18 squares, microwave a square, salt it, roll it out to fit the fudge tray.
9. Caramel corn machine may beep multiple times — only turn off heat and add popcorn once the temp rises to 270°F after it beeps.
10. Popcorn flavor order matters: always White Cheddar before Orange Cheddar; always pop a cleaning batch after Kettle Corn before non-sweet flavors.
11. Leftover oreo pieces from Oreo Popcorn go with the fudge oreo pieces — don't throw them away.
12. Cheddar mix must be fully liquid before pouring on popcorn — steam method on the mini stove at 425°F, stir until no clumps.
13. Kettle corn — no salt in the machine; add the kettle mix at the first pop; salt AFTER dumping into the vat.
14. Fudge pops need almost a full day to dry before scraping, lidding, and sealing.
15. If you don't know where something is in the kitchen, ask the experienced crew: Zach, Alex, Grant, Gabe, Aidan, or Lisa.
16. When in doubt, ask. Don't guess.`
