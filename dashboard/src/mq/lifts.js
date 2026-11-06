/* ---------- LIFTS: what each exercise works, its cues, and (when built) its demo ----------
   Muscles: 1 = the main mover (red), 0.55+ = strong helper (orange), less = helper (yellow).
   A demo is a function of time returning a pose, any moving equipment frames, and cable segments. Demos are
   built one at a time from form footage (start, middle and end of the rep) and checked from three angles;
   an exercise without one stands still with its muscles lit and says so. */
const INFO = {
  adductor: {"muscles": {"adductors": 1, "glutes": 0.2}, "cues": ["Sit tall, back on the pad", "Squeeze the pads together under control", "Pause, then open slowly to a comfortable stretch"]},
  cablelat: {"muscles": {"sdelt": 1, "traps": 0.3, "fdelt": 0.25}, "cues": ["Cable crosses in front of your body", "Raise out to the side in an arc, elbow leading", "Keep tension at the bottom: don’t rest the stack"]},
  cablerow: {"muscles": {"upperback": 1, "lats": 0.8, "rdelt": 0.5, "biceps": 0.5, "erectors": 0.3, "forearms": 0.3}, "cues": ["Chest tall; a small forward reach at the start", "Pull to your belly button, elbows close", "Squeeze the shoulder blades, return over 2 s"]},
  calf: {"muscles": {"calves": 1}, "cues": ["Full stretch at the bottom, pause for 1 s", "Rise as high as you can", "Knees straight, not locked"]},
  chestrow: {"muscles": {"upperback": 1, "lats": 0.7, "rdelt": 0.6, "biceps": 0.5, "forearms": 0.3}, "cues": ["Chest on the pad, feet planted", "Lead with the elbows, squeeze the shoulder blades", "Pause at the back, then 2 s out", "Don’t lift the chest off the pad"]},
  closegrip: {"muscles": {"triceps": 1, "chest": 0.7, "fdelt": 0.5}, "cues": ["Grip just inside shoulder width", "Elbows tucked; touch the lower chest", "Press with the triceps, wrists stacked"]},
  crunch: {"muscles": {"abs": 1, "obliques": 0.4}, "cues": ["Plate on the chest, feet hooked", "Curl the ribs towards the hips, don’t yank the neck", "Lower under control; no rest at the bottom"]},
  curl: {"muscles": {"biceps": 1, "forearms": 0.5, "fdelt": 0.15}, "cues": ["Elbows pinned to your sides", "Curl without swinging", "Lower all the way over 2–3 s"]},
  dbrow: {"muscles": {"lats": 1, "upperback": 0.75, "rdelt": 0.5, "biceps": 0.5, "forearms": 0.3}, "cues": ["Flat back, torso close to horizontal", "Row the dumbbell towards your hip", "Full stretch at the bottom"]},
  dip: {"muscles": {"triceps": 1, "chest": 0.85, "fdelt": 0.6}, "cues": ["Lean forward a little to load the chest", "Lower until the upper arms are level", "Elbows travel back, not out"]},
  facepull: {"muscles": {"rdelt": 1, "upperback": 0.8, "sdelt": 0.3, "traps": 0.3}, "cues": ["Rope to your forehead, elbows high", "Pull the rope apart, thumbs back", "Pause for 1 s"]},
  flatpress: {"muscles": {"chest": 1, "fdelt": 0.55, "triceps": 0.5}, "cues": ["Shoulder blades back and down into the bench", "Elbows 45–60° from your sides", "Lower for 2–3 s until the dumbbells reach chest height", "Press up and slightly in"]},
  hammer: {"muscles": {"forearms": 0.85, "biceps": 0.9}, "cues": ["Thumbs up the whole way", "Elbows still at your sides", "Lower for 2 s"]},
  hipthrust: {"muscles": {"glutes": 1, "hams": 0.45, "quads": 0.3, "erectors": 0.2}, "cues": ["Upper back on the bench edge", "Drive through your heels, ribs down", "Lock the hips out and pause for 1 s"]},
  inclinecurl: {"muscles": {"biceps": 1, "forearms": 0.4, "fdelt": 0.15}, "cues": ["Bench at 45–60°; arms hang behind your torso", "Elbows stay pointing at the floor", "Full stretch at the bottom of every rep"]},
  inclinepress: {"muscles": {"chest": 1, "fdelt": 0.65, "triceps": 0.5}, "cues": ["Bench at about 30°", "Shoulder blades pinned, chest up", "Lower 2–3 s to the upper chest", "Wrists stacked over the elbows"]},
  kneeraise: {"muscles": {"abs": 1, "obliques": 0.55, "forearms": 0.4, "lats": 0.2}, "cues": ["Start from a still hang: no swinging", "Curl the pelvis up, not just the knees", "Lower for 2 s"]},
  lateral: {"muscles": {"sdelt": 1, "traps": 0.35, "fdelt": 0.3}, "cues": ["Arms out a little in front of your sides (about 30°)", "Lead with the elbows, slight bend", "Stop at shoulder height, lower for 2–3 s", "Don’t shrug"]},
  legcurl: {"muscles": {"hams": 1, "calves": 0.3}, "cues": ["Thigh pad snug just above the knees", "Curl all the way under", "Control it back up; don’t let the stack slam"]},
  legext: {"muscles": {"quads": 1}, "cues": ["Knee lined up with the machine’s pivot", "Extend fully and squeeze for 1 s", "Lower over 2–3 s"]},
  legpress: {"muscles": {"quads": 1, "glutes": 0.7, "adductors": 0.5, "hams": 0.2}, "cues": ["Feet mid-platform, shoulder width", "Lower until your knees are about 90°", "Lower back stays flat on the pad", "Don’t lock the knees out"]},
  machlat: {"muscles": {"sdelt": 1, "traps": 0.3, "fdelt": 0.25}, "cues": ["Shoulders level with the machine’s pivots", "Push out with your elbows, not your hands", "Up to shoulder height, lower slowly", "Chest stays on the pad"]},
  machpress: {"muscles": {"chest": 1, "fdelt": 0.55, "triceps": 0.5}, "cues": ["Seat so the handles line up with mid-chest", "Shoulder blades back against the pad", "Press forward, stop just short of locking out", "Let the handles come back for 2–3 s"]},
  ohp: {"muscles": {"fdelt": 1, "triceps": 0.6, "sdelt": 0.55, "traps": 0.3}, "cues": ["Back and head flat on the pad", "Start with the handles at chin height", "Press up without locking out hard; lower for 2 s"]},
  ohtri: {"muscles": {"triceps": 1, "abs": 0.2}, "cues": ["Elbows by your head, pointing forward", "Get a deep stretch behind your head", "Extend fully, return over 2–3 s"]},
  pecdeck: {"muscles": {"chest": 1, "fdelt": 0.4}, "cues": ["A slight, fixed bend in the elbows", "Bring the hands together in a wide arc", "Open slowly to a deep chest stretch"]},
  preacher: {"muscles": {"biceps": 1, "forearms": 0.4}, "cues": ["Backs of the arms flat on the pad", "Lower until the arms are almost straight", "Curl up without lifting the elbows"]},
  pulldown: {"muscles": {"lats": 1, "upperback": 0.55, "biceps": 0.5, "rdelt": 0.4, "forearms": 0.3}, "cues": ["Lean back a little, chest up", "Pull your elbows down to your sides", "Bar to the upper chest; let it rise for 2 s"]},
  pullup: {"muscles": {"lats": 1, "biceps": 0.6, "upperback": 0.55, "rdelt": 0.4, "forearms": 0.45, "abs": 0.2}, "cues": ["Start from a dead hang", "Drive the elbows down to your ribs", "Chin over the bar, lower for 2 s"]},
  pushdown: {"muscles": {"triceps": 1, "forearms": 0.2, "abs": 0.15}, "cues": ["Elbows fixed at your sides", "Push down until your arms are straight", "Return to about 90°, slowly"]},
  rdl: {"muscles": {"hams": 1, "glutes": 0.85, "erectors": 0.7, "adductors": 0.4, "forearms": 0.3, "upperback": 0.25}, "cues": ["Push the hips back; knees soft, not bending more", "Bar stays in contact with your legs", "Stop when the hamstrings stop stretching", "Neutral spine: chest proud, eyes down"]},
  revpec: {"muscles": {"rdelt": 1, "upperback": 0.65, "sdelt": 0.3}, "cues": ["Chest on the pad", "Sweep the arms out and back, elbows leading", "Squeeze, then return over 2 s"]},
  seatedcalf: {"muscles": {"calves": 1}, "cues": ["Pad on the lower thighs, balls of the feet on the step", "Full stretch at the bottom, pause", "Push up onto the big toe, hold 1 s"]},
  skull: {"muscles": {"triceps": 1, "forearms": 0.2}, "cues": ["Upper arms stay close to vertical", "Lower the bar to just behind your head", "Extend without flaring the elbows"]},
  splitsquat: {"muscles": {"quads": 1, "glutes": 0.85, "adductors": 0.5, "hams": 0.25}, "cues": ["Back foot on the bench, laces down", "Front shin roughly vertical, slight forward lean", "Drop the back knee straight down", "Drive up through the whole front foot"]},
  squat: {"muscles": {"quads": 1, "glutes": 0.85, "adductors": 0.6, "erectors": 0.45, "hams": 0.3, "abs": 0.3, "calves": 0.15}, "cues": ["Bar over mid-foot the whole way down and up", "Brace, then sit down between your hips", "Knees track out over your toes", "Hip crease to knee height or lower"]},
  stand: {"muscles": {}, "cues": []},
  straightarm: {"muscles": {"lats": 1, "triceps": 0.35, "rdelt": 0.3, "abs": 0.3}, "cues": ["Hinge a little, arms straight", "Sweep the bar to your thighs with your lats", "Let it rise until your arms are overhead"]}
};
const MATCH = [
  [/incline.*curl/, 'inclinecurl'], [/preacher/, 'preacher'], [/hammer/, 'hammer'], [/incline.*(press|bench)/, 'inclinepress'], [/close.?grip/, 'closegrip'], [/skull|lying tri/, 'skull'],
  [/overhead.*(tri|ext)|french press/, 'ohtri'], [/push.?down/, 'pushdown'], [/dip/, 'dip'], [/reverse pec|rear delt|reverse fl/, 'revpec'], [/face.?pull/, 'facepull'],
  [/pec deck|fly|flye/, 'pecdeck'], [/machine lat/, 'machlat'], [/cable lat/, 'cablelat'], [/lateral|side raise/, 'lateral'], [/(machine|seated) chest press|chest press/, 'machpress'],
  [/shoulder press|overhead press|military|ohp/, 'ohp'], [/straight.?arm|pullover/, 'straightarm'], [/pull.?up|chin.?up/, 'pullup'], [/pull.?down/, 'pulldown'], [/chest.?supported/, 'chestrow'],
  [/single.?arm|one.?arm|(db|dumbbell) row/, 'dbrow'], [/row/, 'cablerow'], [/leg curl|hamstring curl|lying curl|seated curl/, 'legcurl'], [/leg ext/, 'legext'], [/curl/, 'curl'],
  [/leg press/, 'legpress'], [/split squat|bulgarian/, 'splitsquat'], [/squat/, 'squat'], [/rdl|romanian|stiff/, 'rdl'], [/seated calf/, 'seatedcalf'], [/calf/, 'calf'],
  [/knee raise|leg raise/, 'kneeraise'], [/hip thrust|glute bridge/, 'hipthrust'], [/adductor|inner thigh|copenhagen/, 'adductor'], [/crunch|sit.?up/, 'crunch'], [/bench|press/, 'flatpress']
];
const moveFor = name => { const n = String(name || '').toLowerCase(); for (const [re, k] of MATCH) if (re.test(n)) return k; return 'stand'; };
const EX = {};
for (const [k, v] of Object.entries(INFO)) EX[k] = {...v};
EX.stand = EX.stand || {muscles: {}, cues: []};
const demo = (k, d) => { EX[k] = {...(INFO[k] || {}), ...d}; };
