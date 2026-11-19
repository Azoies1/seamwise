# Seamwise quality rubric and question bank

Status: proposal, 2026-11-19. Companion to `docs/decision-providers-plan.md`.

Part 1 is the full question bank, written as a garment technologist would inspect a piece. Part 2 is how code turns the answers into a grade. Part 3 is the benchmarks. Part 4 is the simplified version for everyday users.

## Ground rules

These follow how decision models work best:

1. **The model observes, code judges.** No question asks "Is this good quality?". Each one asks about something a person could point at in the photo, such as "Are the stitches evenly spaced?". Weights, caps and the grade stay in `src/rubric.ts`, where they can be read and tested.
2. **Gate every region with a visibility question.** A `choice` always picks an option, even when the seam is not in the photo. Each group of questions has a gate `noul` ("Is the inside of a seam visible in `photo`?"). Code reads the group only when the gate is ≥ 0.7. This replaces the `not_visible` option in the current schema.
3. **Ask everything at once, read only what applies.** Questions are cheap and run in parallel. Send the whole bank for an image in one call. Code ignores the denim questions on a tee, and the seam questions when the gate says no seam is visible.
4. **One judgment per question.** "Puckered or wavy" becomes two questions. Direction and magnitude are separate questions.
5. **Score levels are situations.** Each level should read on its own, for example "Stitches are clearly uneven along most of the seam", not "Worse than the level above".
6. **Noul thresholds:** ≥ 0.7 is yes, ≤ 0.3 is no, and in between is unknown. Unknown is not evidence.
7. **One image per call.** The state is the image plus what code already knows: the declared shot type, the garment category if known, and the scale reference if one is present. Leave out the product title and marketing copy, since they pull the answers.

Type key: **N** = noul (probability yes), **C** = choice, **S** = score (ordered levels, lowest first), **B** = box (Jev only: where it is in the image).

Dimension key (the existing `DIMENSIONS`): **F** fabric, **C** construction, **H** hardware, **D** durability, **–** gate or metadata, not scored.

---

## Part 1: Expert question bank

### 1.0 Image gates (always asked, every image)

| id | T | Question | Options / levels |
|---|---|---|---|
| `garment_present` | N | Does `photo` show a piece of clothing? | true: a garment or part of one fills much of the frame. false: a person, room or object with no garment in focus. |
| `shot_type` | C | What part of the garment does `photo` mainly show? | `full_garment`, `on_model`, `fabric_closeup`, `seam_inside`, `seam_outside`, `hem_or_cuff`, `collar_or_neckline`, `care_label`, `brand_label`, `hardware`, `backlit_fabric`, `other_detail` |
| `sharpness` | S | How sharp is the garment in `photo`? | 0 blurred, no thread detail. 1 shapes clear, threads not. 2 individual stitches visible. 3 individual yarns visible. |
| `lighting` | S | How well lit is the garment? | 0 too dark or blown out to judge colour or surface. 1 usable with heavy shadows or glare. 2 even light. |
| `is_render` | N | Is `photo` a 3D render or illustration rather than a photograph? | |
| `is_retouched` | N | Does the garment look digitally smoothed, with no wrinkles or texture where some would be expected? | |
| `is_pinned` | N | Is the garment clipped, pinned or taped to change how it hangs? | |
| `is_worn_item` | N | Does the garment look previously worn or washed rather than new? | true: fading, soft creases, wear at stress points. false: crisp, new, store condition. |
| `scale_ref_present` | N | Is a coin, card or ruler next to the fabric in `photo`? | |
| `scale_ref_box` | B | Where is the coin, card or ruler in `photo`? | Read only if `scale_ref_present` ≥ 0.7. Code uses the box to work out pixels per millimetre. |

### 1.1 Region gates (always asked; each opens a section below)

| id | T | Question | Opens |
|---|---|---|---|
| `vis_fabric_surface` | N | Can the fabric's surface texture be seen up close in `photo`? | 1.2 |
| `vis_yarns` | N | Can individual yarns or knit loops be told apart in `photo`? | 1.2 structure items |
| `vis_backlit` | N | Is light shining through the fabric from behind in `photo`? | 1.2 opacity |
| `vis_stitches` | N | Can individual stitches be counted along a seam in `photo`? | 1.3 |
| `vis_seam_inside` | N | Is the inside of a seam visible, showing how the raw edge is finished? | 1.4 |
| `vis_hem` | N | Is a hem or cuff edge visible up close? | 1.5 |
| `vis_collar` | N | Is a collar, neckline or placket visible up close? | 1.5 |
| `vis_pattern_across_seam` | N | Does a stripe, check or print cross a seam in `photo`? | 1.6 matching |
| `vis_buttons` | N | Are buttons visible in `photo`? | 1.7 buttons |
| `vis_zipper` | N | Is a zipper visible in `photo`? | 1.7 zipper |
| `vis_other_hardware` | N | Are snaps, rivets, buckles, grommets or cord ends visible? | 1.7 other |
| `vis_label_text` | N | Is printed text on a care or composition label legible? | 1.10 (OCR call) |
| `vis_print` | N | Does the garment carry a screen print, transfer or embroidery graphic? | 1.8 |
| `vis_lining` | N | Is the inside of the garment body visible, showing whether it is lined? | 1.9 outerwear |

### 1.2 Fabric (F)

| id | T | Question | Options / levels | Gate |
|---|---|---|---|---|
| `fab_structure` | C | How is this fabric made? | `jersey_knit`, `rib_knit`, `interlock`, `waffle_or_thermal`, `fleece_brushed_back`, `french_terry`, `sweater_knit`, `plain_weave`, `twill`, `oxford`, `poplin`, `satin`, `denim_twill`, `nonwoven_or_coated` | yarns |
| `fab_density` | S | How tightly is the fabric constructed? | 0 gaps between yarns clearly visible. 1 small gaps visible in places. 2 yarns sit close with no gaps. 3 so tight individual yarns barely separate. | yarns |
| `fab_evenness` | S | How even is the fabric's structure across the visible area? | 0 thick and thin areas, streaks or barré lines. 1 slight variation in places. 2 uniform throughout. | yarns |
| `fab_slubs_intended` | N | Are any thick-and-thin yarn bumps (slubs) part of a deliberate design across the whole fabric? | true: evenly scattered by design (slub jersey, linen). false: isolated defects. | yarns |
| `fab_defects` | N | Are there knots, dropped stitches, holes or snags in the fabric? | | surface |
| `fab_surface_fuzz` | S | How much loose fibre stands up from the surface? | 0 clean, crisp surface. 1 light haze of fibres. 2 visible fuzz. 3 pills or balls of fibre. | surface |
| `fab_sheen` | C | What kind of shine does the fabric have? | `matte`, `soft_natural_lustre` (silk, mercerised cotton, wool), `plastic_shine` (glassy, uniform, typical of cheap polyester), `coated_or_waxed` | surface |
| `fab_hand_visual` | C | How does the fabric fall where it bends or hangs? | `fluid_drape`, `soft_body`, `crisp_structured`, `stiff_papery`, `limp_thin` | full garment or on model |
| `fab_weight_visual` | S | How heavy does the fabric look from its thickness at the edges and folds? | 0 very thin, see-through at folds. 1 light. 2 medium. 3 heavy, thick folds. | surface |
| `fab_opacity` | S | How much light passes through the fabric? | 0 shapes behind are clearly visible. 1 light glows through evenly. 2 a faint glow only. 3 no light passes. | backlit |
| `fab_opacity_uneven` | N | Does light pass through unevenly, with brighter thin patches? | | backlit |
| `fab_wrinkle_state` | S | How wrinkled is the fabric after normal handling? | 0 sharp creases all over. 1 some creases. 2 few soft creases. 3 smooth. | full garment, not retouched |
| `fab_fiber_dominant` | C | Judging only by how the fabric looks, which fibre makes up most of it? | `cotton`, `linen`, `wool`, `silk`, `polyester`, `nylon`, `acrylic`, `viscose_or_modal`, `blend_unclear` | surface |
| `fab_synthetic_present` | N | Does the fabric show signs of synthetic fibre (glassy shine, static fuzz, pills that do not fall off)? | | surface |
| `fab_brushed` | N | Has the fabric surface been brushed or napped for softness? | | surface |
| `fab_print_on_surface` | N | Is the colour or pattern printed on the surface rather than woven or knitted in? | true: white shows at the yarn sides or the back. false: the colour goes through the yarn. | surface |

### 1.3 Stitching (C)

| id | T | Question | Options / levels | Gate |
|---|---|---|---|---|
| `st_spacing_even` | S | How evenly spaced are the stitches along the seam? | 0 visibly irregular along most of the seam. 1 a few uneven stretches. 2 even throughout. | stitches |
| `st_line_straight` | S | How straight does the stitch line run? | 0 wanders off the seam line. 1 slight drift in places. 2 straight and parallel to the edge. | stitches |
| `st_density` | S | How close together are the stitches? | 0 long stitches, about 6 or fewer per inch. 1 about 7–9 per inch. 2 about 10–12 per inch. 3 about 13 or more per inch, fine and close. | stitches |
| `st_count_box` | B | Where is a 2 cm stretch of straight seam in `photo`? | Jev only. Code crops it and counts stitches against `scale_ref_box`. | stitches + scale |
| `st_tension_balanced` | N | Do the stitches sit flat, without loops of thread pulled through or fabric drawn up? | | stitches |
| `st_skipped` | N | Are any stitches skipped or missing along the seam? | | stitches |
| `st_backtacked` | N | Is the seam end secured with a backstitch or bar tack rather than left to unravel? | | stitches |
| `st_thread_match` | N | Does the thread colour match the fabric, or contrast in a deliberate, even way? | | stitches |
| `st_loose_threads` | S | How many loose thread ends are visible? | 0 none. 1 one or two short ends. 2 several long ends. | stitches |
| `st_type` | C | What kind of stitch forms the seam? | `single_needle_lockstitch`, `double_needle_topstitch`, `coverstitch` (two or more parallel rows outside, looping inside), `overlock_only`, `chainstitch`, `flatlock`, `hand_stitch` | stitches |

### 1.4 Seams and seam finishes (C, D)

| id | T | Question | Options / levels | Gate |
|---|---|---|---|---|
| `sm_finish` | C | How is the raw edge inside the seam finished? | `flat_felled` (folded and stitched down twice, no raw edge), `french` (raw edge enclosed in a narrow tube), `bound` (wrapped in tape), `overlocked` (looped thread over the edge), `pinked` (zigzag-cut), `raw` (cut edge left loose) | seam inside |
| `sm_overlock_density` | S | How dense is the overlock thread over the edge? | 0 sparse loops, fabric shows between. 1 moderate. 2 dense, fully covers the edge. | seam inside |
| `sm_allowance` | S | How wide is the seam allowance? | 0 trimmed very close, under 5 mm. 1 about 5–10 mm. 2 generous, over 10 mm. | seam inside |
| `sm_fraying` | N | Is the raw edge inside the seam fraying? | | seam inside |
| `sm_pucker` | S | How much does the fabric gather along the seam? | 0 strongly puckered along the length. 1 slight gathering in places. 2 flat. | stitches or seam |
| `sm_wavy` | N | Does the seam ripple or wave where it should lie flat? | | stitches or seam |
| `sm_taped_shoulder` | N | Is the shoulder or neck seam reinforced with tape? | | seam inside or collar |
| `sm_pressed` | N | Is the seam pressed flat and open, or neatly to one side? | | seam |
| `sm_slippage` | N | Are yarns pulling apart next to the seam, leaving a gap? | | seam |
| `sm_bar_tack` | N | Are stress points (pocket corners, fly, belt loops) reinforced with dense bar tacks? | | any detail |
| `sm_side_seam_present` | N | Does the body have side seams? | false: tubular knit, common in older or heritage tees. | full garment |

### 1.5 Edges: hems, cuffs, collars, plackets (C)

| id | T | Question | Options / levels | Gate |
|---|---|---|---|---|
| `hem_type` | C | How is the hem finished? | `coverstitch_twin_needle`, `blind_hem` (stitches nearly invisible outside), `double_turned_topstitch`, `rolled_narrow`, `ribbed_band`, `raw_cut`, `overlock_only` | hem |
| `hem_depth` | S | How deep is the hem fold? | 0 narrow, under 1 cm. 1 about 1–2.5 cm. 2 deep, over 2.5 cm. | hem |
| `hem_even` | S | How even is the hem width along its length? | 0 clearly varies. 1 slight variation. 2 consistent. | hem |
| `hem_twisting` | N | Does the hem twist or flip outward? | | hem |
| `neck_type` | C | How is the neckline finished? | `rib_collar_bound`, `self_fabric_binding`, `rib_with_back_tape`, `facing`, `raw_or_rolled` | collar |
| `neck_lies_flat` | N | Does the neckline lie flat without rippling? | | collar |
| `neck_rib_recovery` | S | How firm does the neck rib look? | 0 stretched or wavy. 1 slightly relaxed. 2 snug and springy, tight ribs. | collar |
| `collar_points_sharp` | N | Are the collar points crisp and symmetrical? | | collar (shirt) |
| `collar_bubbling` | N | Is the collar or cuff bubbling or wrinkled where interfacing has come loose? | | collar (shirt) |
| `placket_straight` | N | Does the button placket run straight and flat? | | collar (shirt) |
| `cuff_type` | C | How is the cuff made? | `rib_cuff`, `button_cuff_with_gauntlet`, `button_cuff_no_gauntlet`, `turned_hem`, `raw` | hem |

### 1.6 Cut, pattern and assembly (C)

| id | T | Question | Options / levels | Gate |
|---|---|---|---|---|
| `cut_symmetry` | S | How symmetrical are the left and right sides? | 0 clearly mismatched lengths or shapes. 1 slight differences. 2 symmetrical. | full garment |
| `cut_grain_twist` | N | Does the side seam spiral toward the front or back? | true: the seam twists, a sign of off-grain cutting. | full garment |
| `cut_pattern_match` | S | How well do stripes or checks line up across the seam? | 0 clearly offset. 1 close but not exact. 2 matched precisely. | pattern across seam |
| `cut_pattern_centered` | N | Is the main pattern or print centred on the body? | | full garment, print |
| `cut_pocket_aligned` | N | Is the pocket straight and placed level? | | full garment |
| `cut_drag_lines` | N | Do diagonal drag lines appear where the garment should hang smoothly? | | on model |
| `cut_shoulder_sits` | N | Does the shoulder seam sit at the edge of the shoulder (or drop deliberately and evenly)? | | on model |

### 1.7 Hardware and trims (H)

| id | T | Question | Options / levels | Gate |
|---|---|---|---|---|
| `btn_material` | C | What are the buttons made of? | `horn`, `mother_of_pearl_or_shell`, `corozo_or_wood`, `metal`, `thick_plastic`, `thin_plastic` | buttons |
| `btn_attachment` | C | How are the buttons sewn on? | `shanked` (wrapped thread stalk), `cross_stitched`, `parallel_stitched`, `machine_lock_stitched` | buttons |
| `btn_secure` | N | Are all visible buttons sewn tightly, with no loose threads? | | buttons |
| `btn_hole_quality` | S | How clean are the buttonholes? | 0 frayed or sparse stitching. 1 neat with some fuzz. 2 dense, clean, keyhole or bound. | buttons |
| `btn_spare` | N | Is a spare button attached inside? | | buttons |
| `zip_material` | C | What are the zipper teeth made of? | `metal`, `molded_plastic`, `coil` | zipper |
| `zip_brand_mark` | N | Is a maker's mark legible on the zipper pull or slider? | true triggers OCR for the mark (YKK, Riri, Lampo, others). | zipper |
| `zip_lies_flat` | N | Does the zipper lie flat without waving? | | zipper |
| `zip_storm_flap` | N | Does a fabric flap cover the zipper? | | zipper (outerwear) |
| `zip_garage` | N | Is there a fabric garage covering the zipper top at the chin? | | zipper (outerwear) |
| `hw_rivets` | N | Are rivets used at pocket corners? | | other hardware (denim) |
| `hw_finish_wear` | N | Is plating or paint wearing off any hardware? | | any hardware |
| `hw_cord_ends` | C | How are drawcord ends finished? | `metal_aglet`, `plastic_aglet`, `knotted`, `raw` | other hardware |
| `trim_label_type` | C | How is the brand label made? | `woven`, `printed_fabric`, `printed_on_garment`, `heat_transfer` | brand label |

### 1.8 Print, dye and embellishment (F, D)

| id | T | Question | Options / levels | Gate |
|---|---|---|---|---|
| `prt_method` | C | How is the graphic applied? | `screen_print_plastisol` (thick, rubbery, sits on top), `water_based_or_discharge` (soft, in the fabric), `dtg` (digital, slightly faded edges), `heat_transfer_vinyl`, `embroidery`, `applique` | print |
| `prt_edges_sharp` | S | How sharp are the graphic's edges? | 0 blurred or bleeding. 1 slightly soft. 2 crisp. | print |
| `prt_registration` | N | Do the print colours line up with each other without gaps or overlaps? | | print |
| `prt_cracking` | N | Is the print cracking or peeling? | | print |
| `emb_density` | S | How dense is the embroidery? | 0 fabric shows through the stitches. 1 mostly covered. 2 fully covered, raised. | print |
| `emb_backing_puckers` | N | Is the fabric puckered around the embroidery? | | print |
| `dye_even` | S | How even is the colour across the garment? | 0 blotchy or streaked. 1 slight variation. 2 even (or deliberately garment-dyed and uniform). | full garment |
| `dye_panel_mismatch` | N | Do different panels show slightly different shades? | | full garment |

### 1.9 Category-specific (read only for the matching category)

**Knitwear**
| id | T | Question | Options / levels |
|---|---|---|---|
| `kn_fully_fashioned` | N | Are there fashioning marks (small paired stitch marks where the shape was knitted in) near the seams? |
| `kn_linked_seams` | N | Are the pieces joined by linking (a fine chain of loops) rather than overlocked cut edges? |
| `kn_gauge` | S | How fine is the knit? | 0 chunky, large stitches. 1 mid gauge. 2 fine. 3 extra fine, stitches barely visible. |
| `kn_rib_recovery` | S | How firm do the cuffs and hem ribs look? | 0 flared and stretched. 1 slightly relaxed. 2 snug. |
| `kn_hairiness` | S | How hairy is the yarn? | 0 smooth. 1 light halo. 2 very hairy (mohair, brushed). |

**Denim**
| id | T | Question | Options / levels |
|---|---|---|---|
| `dn_selvedge` | N | Is there a self-finished edge (usually with a coloured line) inside the outseam? |
| `dn_chainstitch_hem` | N | Is the hem sewn with a chainstitch that forms a rope-like ridge? |
| `dn_twill_visible` | S | How distinct is the diagonal twill line? | 0 flat or faint. 1 visible. 2 pronounced. |
| `dn_irregular_yarn` | N | Does the denim show uneven, slubby yarn texture? |
| `dn_bar_tacks` | N | Are belt loops and the fly secured with bar tacks? |
| `dn_rivets_backs` | C | How are the rivets backed? | `branded_burr`, `plain_burr`, `none_visible` |
| `dn_waistband_type` | C | How is the waistband made? | `separate_band_with_chainstitch`, `separate_band_lockstitch`, `folded_self_fabric` |

**Outerwear**
| id | T | Question | Options / levels |
|---|---|---|---|
| `ow_lining` | C | How much of the body is lined? | `fully_lined`, `partially_lined`, `unlined` |
| `ow_lining_fabric` | C | What is the lining like? | `smooth_satin_or_twill`, `mesh`, `quilted`, `fleece`, `thin_taffeta` |
| `ow_seam_taped` | N | Are the inside seams sealed with tape? |
| `ow_baffle_type` | C | How are insulated sections made? | `box_baffle`, `sewn_through`, `none` |
| `ow_fill_even` | N | Is the insulation evenly spread between the stitch lines? |
| `ow_down_leak` | N | Are feathers or fibre poking through the shell? |
| `ow_cuff_inner` | N | Are there inner storm cuffs or adjustable cuff tabs? |

**Shirts and tailoring**
| id | T | Question | Options / levels |
|---|---|---|---|
| `sh_split_yoke` | N | Is the back yoke made of two pieces joined at the centre? |
| `sh_single_needle_side` | N | Are the side seams sewn with a single, narrow line of stitching? |
| `sh_gauntlet_button` | N | Is there a small button on the sleeve placket above the cuff? |
| `sh_buttonhole_horizontal_collar` | N | Is the collar-band buttonhole horizontal? |
| `tl_canvas_vs_fused` | C | How does the jacket front hold its shape? | `floating_canvas_roll` (soft roll at the lapel, no stiff flatness), `half_canvas`, `fused_flat` (flat and stiff, may bubble) |
| `tl_pick_stitch` | N | Is there fine hand pick-stitching along the lapel edges? |
| `tl_working_cuffs` | N | Do the sleeve buttons have real buttonholes that open? |

### 1.10 Labels (generative OCR call, triggered by `vis_label_text`)

Decision models cannot transcribe. When `vis_label_text` ≥ 0.7, send that one image to the generative provider for: composition (fibre and percent, by part), country of origin, RN/CA number, brand, and care symbols.

Decision questions that still help:
| id | T | Question |
|---|---|---|
| `lbl_multi_part` | N | Does the label list separate compositions for parts (shell, lining, rib)? |
| `lbl_care_gentle` | N | Do the care instructions require hand wash or dry clean? |
| `lbl_is_printed_satin` | N | Is the care label printed on a thin satin strip (rather than woven)? |

Code uses the OCR output with `parseComposition` and the fibre values already in `rubric.ts`. Composition stays an input that sets a ceiling on fabric, never a score on its own.

### 1.11 Wear and durability, for worn garments (D)

Read only when `is_worn_item` ≥ 0.7. This is the strongest evidence there is, because it shows how the garment actually aged.

| id | T | Question | Options / levels |
|---|---|---|---|
| `wr_pilling` | S | How pilled is the fabric in high-friction areas (underarms, sides)? | 0 none. 1 light fuzz. 2 visible pills. 3 dense pilling. |
| `wr_neck_stretch` | S | How stretched is the neckline? | 0 like new. 1 slightly relaxed. 2 wavy and stretched. |
| `wr_fading` | S | How faded is the colour? | 0 none. 1 slight, even. 2 patchy. |
| `wr_seam_failure` | N | Has any seam opened or has stitching broken? |
| `wr_holes` | N | Are there holes or thin worn-through spots? |
| `wr_shrink_twist` | N | Has the garment twisted so seams run diagonally? |
| `wr_hem_unravel` | N | Is a hem unravelling? |

---

## Part 2: From answers to a grade (code)

### 2.1 Reading an answer

- **Noul:** yes at ≥ 0.7, no at ≤ 0.3, otherwise unknown and skipped.
- **Choice and Score:** use the full probability distribution, not only the top answer. The value is the expected value over the options' values in the table below. For a Score, look at the level probabilities too: two peaks mean the evidence is split, and code should widen the uncertainty.
- **Gate first.** If the gate is below 0.7, the whole section counts as not seen. That is no evidence, not bad evidence.
- **Each observation becomes `Evidence`** (the type the scorer already uses) with a value from 0 to 100, a dimension, and an SD. Image evidence starts at the "medium" SD, lower when `sharpness` is 3 and a scale reference is present, higher when `is_retouched` or `is_render` is yes.

### 2.2 Values for key answers

The values are starting points, to be tuned against benchmark B3 below, never fitted to single garments.

| Answer | Value | Dim |
|---|---|---|
| `sm_finish` flat_felled / french / bound | 85 / 85 / 80 | C |
| `sm_finish` overlocked (dense) / overlocked (sparse) / pinked / raw | 55 / 40 / 45 / 15 | C |
| `st_density` 0 / 1 / 2 / 3 | 20 / 45 / 70 / 85 | C |
| `st_spacing_even` 0 / 1 / 2 | 20 / 50 / 75 | C |
| `sm_pucker` 0 / 1 / 2 | 20 / 50 / 70 | C |
| `cut_pattern_match` 0 / 1 / 2 | 25 / 55 / 90 | C |
| `hem_type` blind / double_turned / coverstitch / overlock_only / raw_cut | 75 / 70 / 60 / 30 / 15 | C |
| `fab_density` 0 / 1 / 2 / 3 | 20 / 45 / 70 / 85 | F |
| `fab_surface_fuzz` (new garment) 0 / 1 / 2 / 3 | 75 / 60 / 35 / 15 | F, D |
| `fab_opacity` (tee) 0 / 1 / 2 / 3 | 20 / 45 / 70 / 80 | F |
| `fab_sheen` plastic_shine | 35 | F |
| `btn_material` horn or shell / corozo / metal / thick plastic / thin plastic | 85 / 75 / 65 / 50 / 25 | H |
| `btn_attachment` shanked / cross / parallel / machine lock | 80 / 65 / 55 / 40 | H |
| `zip_brand_mark` yes (premium mark read) | 80 | H |
| `kn_fully_fashioned` yes | 85 | C |
| `dn_selvedge` yes | 75 | F |
| `tl_canvas_vs_fused` floating canvas / half / fused | 90 / 75 / 40 | C |
| `wr_seam_failure` yes | 10 | D |
| `wr_pilling` 0 / 1 / 2 / 3 (worn) | 85 / 65 / 35 / 15 | D |

Positive features that are simply absent (no gauntlet button, no tape) count as small negatives only where the category expects them, such as a dress shirt without a gauntlet button. Elsewhere they are not evidence.

### 2.3 Hard caps (red flags)

Some single findings limit the grade, however good the rest looks:

| Finding | Cap |
|---|---|
| `sm_finish` = raw on a garment that will be washed | construction ≤ 35 |
| `wr_seam_failure` yes, or `st_skipped` yes | construction ≤ 40 |
| `fab_defects` yes on a new garment | fabric ≤ 45 |
| `fab_opacity` 0 on a tee or shirt | fabric ≤ 40 |
| `prt_cracking` yes on a new garment | durability ≤ 45 |
| `fab_surface_fuzz` 3 on a new garment | durability ≤ 35 |

### 2.4 Category weights for the overall score

| Category | Fabric | Construction | Hardware | Durability |
|---|---|---|---|---|
| tee | 0.40 | 0.35 | 0.00 | 0.25 |
| knitwear | 0.45 | 0.30 | 0.00 | 0.25 |
| denim | 0.35 | 0.35 | 0.10 | 0.20 |
| outerwear | 0.30 | 0.35 | 0.15 | 0.20 |
| shirt | 0.35 | 0.40 | 0.10 | 0.15 |

Hardware weight moves to construction when the garment has no hardware.

### 2.5 Next best photo

After each photo, code computes which dimension still has the widest uncertainty and which gate questions came back "not seen". It then asks for the shot that opens the most valuable unanswered section. For example: construction is still uncertain and no inside seam has been seen, so it asks the user to turn the garment inside out and photograph a side seam.

---

## Part 3: Benchmarks

| # | Benchmark | Ground truth | Metric | Pass bar (initial) |
|---|---|---|---|---|
| B1 | **Fibre from photos** (exists: `backtest/decisions-probe.ts`) | Retailer composition | Accuracy against the always-cotton baseline, per fibre | Beat the baseline on non-cotton items |
| B2 | **Checklist truth set**: 30 garments × 5 phone shots, each answer hand-labelled by someone trained on this rubric | Hand labels | Per-question accuracy. **Over-claim rate**: share of answers where the gate said visible but the truth was "not visible" | Accuracy ≥ 80% on gated questions. Over-claim ≤ 5% |
| B3 | **Expert ranking**: a designer or garment technologist sorts 20 pairs of similar garments by quality | Pairwise expert choices | Share of pairs where Seamwise agrees with the expert (and Kendall's τ over the full ordering) | ≥ 75% agreement |
| B4 | **Calibration** | B2 labels | Bucket answers by probability: in the 0.8 bucket, about 80% should be right | Calibration error ≤ 0.08 |
| B5 | **Repeatability**: the same garment shot 5 times with different phones, light and angles | None needed | SD of the overall score across shots | SD ≤ 5 points |
| B6 | **Measured specs**: GSM with a kitchen scale and a 10×10 cm swatch, stitches per inch with a ruler, opacity with a light meter app | Measurements | Rank correlation between the model's levels (`fab_density`, `st_density`, `fab_opacity`) and the measurement | Spearman ≥ 0.6 |
| B7 | **Wear test** (the gold standard): buy 20 tees across price tiers, score them new, wash and wear 20 cycles, then measure pilling, neck stretch, shrinkage and seam failure | Measured degradation | Does the score when new predict the score after wear? | Spearman ≥ 0.5 |
| B8 | **Provider comparison**: Gemini Decisions, Clef, Jev and a generative model on the B2 set | B2 labels | Accuracy, over-claim, calibration, latency, cost per garment | Pick the cheapest provider within 3 points of the best |
| B9 | **Logo-masked price tier**: blur logos, then ask for the tier | Retailer tier | Accuracy with and without logos | Shows how much the tier relies on logos |

B2 and B5 come first, because every other benchmark needs reliable observations. B7 takes longest, so start it early.

---

## Part 4: Everyday version

### 4.1 Five photos

1. **Whole garment**, laid flat in good light.
2. **Inside seam**: turn the garment inside out and photograph a side seam up close.
3. **Fabric close-up** with a coin next to it.
4. **Fabric against light**: hold it over your phone's torch or a window.
5. **Care label.**

The app asks for these one at a time and stops early when the grade is already confident. Any photo can be skipped.

### 4.2 Twelve questions that do most of the work

These cover most of the signal for tees, sweaters and shirts:

| # | Plain question (shown to the user as a check) | Bank id | Why it matters |
|---|---|---|---|
| 1 | Is the seam edge inside wrapped or folded, or just cut? | `sm_finish` | The best single sign of care in making |
| 2 | Are the stitches small and close together? | `st_density` | Short stitches hold better and show care |
| 3 | Are the stitches even and straight? | `st_spacing_even`, `st_line_straight` | Rushed sewing shows here first |
| 4 | Does the seam lie flat, without puckering? | `sm_pucker` | Puckering gets worse after washing |
| 5 | Is the fabric tightly made, with no gaps between yarns? | `fab_density` | Dense fabric lasts longer and holds its shape |
| 6 | How much light passes through? | `fab_opacity` | A quick stand-in for fabric weight |
| 7 | Is the surface already fuzzy? | `fab_surface_fuzz` | Fuzz on a new garment means pilling soon |
| 8 | Is the hem deep and even? | `hem_depth`, `hem_even` | A shallow hem is a common shortcut |
| 9 | Does the neckline lie flat and feel springy? | `neck_lies_flat`, `neck_rib_recovery` | The first thing to stretch out on a tee |
| 10 | Do stripes or checks line up at the seams? | `cut_pattern_match` | Matching costs time and fabric, so it shows care |
| 11 | Are buttons sewn tight, with clean buttonholes? | `btn_secure`, `btn_hole_quality` | Loose buttons are the first repair |
| 12 | What is it made of? | label OCR | Sets the ceiling for the fabric |

### 4.3 What the user sees

- **Grade:** one of the five existing grades, with confidence (high, medium or low).
- **Three reasons**, each tied to a photo. For example: "Seams are overlocked neatly but not enclosed (photo 2)."
- **One thing to check next**, from 2.5. For example: "Hold it up to the light to check the fabric weight."
- **Hands-on checks** the app suggests in the shop: gently pull a seam and watch for gaps; scrunch the fabric for 5 seconds and see how it recovers; stretch the cuff rib and watch it spring back. These are prompts for the user only. The app does not score them in this version.

### 4.4 Wording rules for the everyday version

- Name what was seen, not a verdict: "stitches are far apart" rather than "poor construction".
- Never claim something the photos did not show. Say "Couldn't see the inside seams" instead.
- Use no jargon without a picture. "Flat-felled" appears only next to a small diagram.

---

## Part 5: Longevity

Durability is today one dimension in the grade. Longevity answers the question buyers actually ask: **how long will this last, and what will fail first?** It is reported next to the grade, not folded into it, because a well-made linen shirt and a well-made fleece can share a grade and still age very differently.

### 5.1 Model: the weakest link

Each category has a few **failure modes**: the ways garments of that type usually reach the end of their life. Each mode has a base life in wear-and-wash cycles. The evidence moves each mode's life up or down. The predicted lifespan is the shortest mode, and that mode is what the user is told to watch.

```
life(mode) = base(category, mode) × Π multiplier(evidence)
lifespan   = min over modes of life(mode)
```

The ranges stay wide, for example "about 30–60 washes", until the B7 wear test and the survival data in 5.5 calibrate them. shortcut: fixed multipliers, not a fitted survival model; upgrade once there are a few hundred survival records.

### 5.2 Failure modes per category

| Category | Failure modes (most common first) |
|---|---|
| tee | neck rib stretches out; pilling; body twists; shrinks; print cracks; side seam opens; fades |
| knitwear | pilling; stretches out of shape; elbows thin; cuffs and hem lose grip; holes at seams |
| denim | crotch wears through; hem frays; belt loops tear; pocket bags wear through; knees blow out |
| outerwear | zipper fails; coating peels (delamination); down leaks or clumps; cuffs fray; seam tape lifts |
| shirt | collar and cuff edges fray; buttons come off; collar interfacing bubbles; armpit seams open |

### 5.3 Evidence that moves each mode

Most of it is already in Part 1. Add these questions to the bank:

| id | T | Question | Mode affected |
|---|---|---|---|
| `lg_elastane_rib` | N | Does the neck or cuff rib look like it contains stretch yarn (glossy core, very springy)? | neck stretch (elastane loses recovery after about 2 years and with heat) |
| `lg_reinforced_stress` | N | Are high-wear areas reinforced (double-layer knees or elbows, crotch gusset, underarm gusset)? | wear-through |
| `lg_bonded_seams` | N | Are seams glued or heat-bonded rather than stitched? | seam failure |
| `lg_coated_fabric` | N | Is the fabric coated or laminated (rubbery or plastic film on one side)? | delamination |
| `lg_fused_interfacing` | N | Does the collar or front feel glued-stiff, with interfacing fused to the fabric? | bubbling |
| `lg_edge_wear_prone` | N | Are collar, cuff or hem edges folded thin over a sharp fold, where they will rub? | edge fraying |
| `lg_extra_allowance` | N | Is there extra seam allowance or hem depth that would let the garment be let out or repaired? | repairability |

Label facts (from OCR) that matter most:

| Fact | Effect |
|---|---|
| Long-staple cotton (pima, supima, Egyptian) | pilling and wear-through life up |
| Viscose or rayon | shrinkage risk up, wet strength low, life down |
| Elastane ≥ 5% | neck and cuff recovery life down after about 2 years |
| Polyester or nylon blend | wear-through life up, pilling up (the pills don't fall off) |
| Acrylic | pilling up sharply |
| Merino or lambswool, worsted | pilling life up compared with woollen spun |
| Linen | strong, but creases wear at fold lines |
| "Dry clean only" or "hand wash" | **care burden**: real-world life down, because many owners machine wash anyway |
| "Pre-shrunk" or "garment dyed" | shrinkage risk down |

### 5.4 Repairability (separate score, not in lifespan)

How easy is the garment to keep going? Each item is a yes/no from Part 1 or 5.3.

- Buttons sewn on (not riveted or snapped), spare button present.
- Zipper sewn in and replaceable (not welded into a laminated seam).
- Seams stitched rather than bonded, so a tailor can re-sew them.
- Generous seam allowance and hem depth (`sm_allowance`, `hem_depth`, `lg_extra_allowance`).
- No coated or laminated shell.

Shown as: Easy to repair, Repairable, or Hard to repair.

### 5.5 Data that calibrates longevity

1. **Reviews (already parsed by `extractReviews`).** Mine reviews for failure reports with a time: "pilled after two washes", "neck stretched after a month", "holes within a year". Each review is a failure mode plus a rough time. This is the only longevity data available at scale today.
2. **B7 wear test** (Part 3): the controlled ground truth.
3. **In-app follow-up.** Six and twelve months after a scan, ask "Still wearing it? What wore out first?". Each answer is a survival record. Fit per-mode survival curves once there are enough.

### 5.6 What the user sees

- **"Expected to last: about 40–80 washes."**
- **"Weakest point: the neck rib. It has stretch yarn and a narrow binding."**
- **"To make it last: wash cold, dry flat."** Care tips are chosen for the weakest mode, for example air-drying for elastane, or washing inside out for prints.
- **"Repair: Easy."**

### 5.7 Benchmark

| # | Benchmark | Ground truth | Metric | Pass bar (initial) |
|---|---|---|---|---|
| B10 | Predicted weakest mode | B7 wear test, review failure reports | Share of garments where the first real failure matches the predicted weakest mode | ≥ 50% (a random guess among 5–7 modes is about 15–20%) |
| B11 | Predicted lifespan | B7 and in-app follow-ups | Rank correlation between predicted and actual lifespan | Spearman ≥ 0.5 |

---

## Rollout

1. Encode Part 1 in `src/vision/questions.ts`. Sections 1.0–1.5 and 1.7 come to about 86 questions. Gemini Decisions takes them in one call (limit 1,000). Clef caps a call at 64, so it needs two calls: the gates and fabric, then the rest. Sections 1.6, 1.8, 1.9 and 1.11 are sent only when the category or gates call for them.
2. Build B2 and B5 (the checklist truth set and repeatability) from phone photos.
3. Map answers to `Evidence` with the values and caps in Part 2. Tune them on B3, never on single garments.
4. Ship Part 4 in the iOS app.
