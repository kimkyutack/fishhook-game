import { BALANCE } from "../config/balance";
export type Habitat = "pond" | "river" | "lake";
const rows = [
  [
    ["송사리", "참붕어", "납자루", "붕어"],
    ["피라미", "버들치", "모래무지"],
    ["빙어", "살치", "줄몰개"],
  ],
  [
    ["미꾸라지", "동자개", "향어"],
    ["은어", "황어", "쉬리", "꺽지"],
    ["메기", "누치", "동사리"],
  ],
  [
    ["비단잉어", "금붕어", "가물치"],
    ["산천어", "무지개송어", "쏘가리"],
    ["잉어", "철갑상어", "큰입배스", "블루길"],
  ],
  [
    ["연꽃꼬리잉어", "홍옥금붕어", "나뭇잎지느러미어"],
    ["청옥은어", "수정송어", "불꽃지느러미쏘가리"],
    ["백금철갑어", "달빛메기", "유리비늘향어", "별무늬가물치"],
  ],
  [
    ["연화왕잉어", "태양금붕어", "유리날개어"],
    ["청룡장어", "오로라송어", "혜성돛새치"],
    ["황금뿔메기", "달무리철갑어", "운해가오리", "별바다용어"],
  ],
];
const descriptions = [
  "slender tiny minnow translucent fan tail",
  "deep silver carp rounded dorsal fin",
  "short diamond body iridescent cheek",
  "round olive crucian carp serrated dorsal",
  "silver streamlined minnow blue lateral stripe",
  "small stout brown minnow forked tail",
  "sand-colored bottom fish long snout barbels",
  "translucent slender smelt long jaw",
  "silver blade-shaped fish upturned belly",
  "tiny striped fish large eyes",
  "long smooth loach rounded fins",
  "yellow catfish short body stout barbels",
  "mirror carp broad leather scale patches",
  "sleek silver sweetfish golden cheek",
  "copper dace long forked tail",
  "colorful striped shiri pointed snout",
  "stocky freshwater perch square tail",
  "wide whiskered catfish dark smooth skin",
  "long silver barbel fish fleshy lips",
  "mottled brown sleeper wide pectoral fins",
  "red white koi flowing twin tail",
  "round orange goldfish twin fan tail",
  "long green snakehead broad head",
  "salmon with dark parr marks pink sides",
  "rainbow trout speckled silver pink stripe",
  "golden mandarin fish jagged dorsal",
  "bronze common carp two barbels",
  "armored sturgeon pointed snout scutes",
  "bigmouth bass broad mouth olive back",
  "round bluegill blue gill and spiny dorsal",
  "lotus petal tail koi with broad layered pink fins",
  "ruby goldfish faceted plump body curled tail",
  "leaf-shaped fins green narrow body",
  "jade sweetfish long smooth green body",
  "crystal trout angular transparent fins",
  "flame-fin mandarin fish jagged orange fin silhouette",
  "platinum sturgeon long armor plates",
  "moonlight catfish crescent whiskers",
  "glass-scaled mirror carp translucent oval body",
  "star-patterned snakehead elongated speckled body",
  "regal lotus koi huge layered petal tail crown-shaped dorsal",
  "sun goldfish circular body radial fan fins",
  "glass wing fish giant transparent butterfly fins",
  "azure dragon eel long serpentine body antler fins",
  "aurora trout ribbon dorsal tail silky green purple fins",
  "comet sailfish long bill enormous triangular sail",
  "gold horn catfish broad body curved golden horns whiskers",
  "moon halo sturgeon crescent scutes arching tail",
  "cloud manta ray wide diamond wings long wispy tail",
  "star sea dragon fish long flowing fins dragon head constellation scales",
];
let n = 0;
export const FISH = rows.flatMap((habitats, s) =>
  habitats.flatMap((names, h) =>
    names.map((name) => {
      const i = n++;
      const id = `fish_${String(i + 1).padStart(3, "0")}`;
      return {
        id,
        name,
        star: s + 1,
        habitat: (["pond", "river", "lake"] as const)[h],
        sellPrice: BALANCE.sell[s + 1],
        imageKey: id,
        displayScale: 1,
        visualDescription: descriptions[i],
      };
    }),
  ),
);
export const fishById = (id: string) => FISH.find((f) => f.id === id)!;
export const HABITAT_NAMES = { pond: "연못", river: "강", lake: "호수" };
