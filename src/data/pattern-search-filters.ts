/**
 * Ravelry's pattern-search vocabulary, written down.
 *
 * Every permalink in this file has been answered 200 by
 * `GET /patterns/search.json` — the endpoint returns **500** for a value it
 * does not recognise, so a filter this app cannot vouch for is a filter that
 * breaks the whole screen. The tables were built on 2026-08-19 by reading
 * `/pattern_categories/list.json`, `/pattern_attributes/groups.json` and
 * `/languages/list.json`, then probing every value one at a time.
 *
 * Two facts made that necessary rather than paranoid:
 *
 * 1. The attributes endpoint hands back `{id, name}` and no permalink, and the
 *    permalink is not the slugified name. "cap" is `cap-sleeve`, "patch" is
 *    `patch-pocket`, "circle" is `circle-shaped`, "Fair Isle" is `fairisle`,
 *    and two of them — `Intarsia` and `Shetland` — are capitalised. The ones
 *    that could not be guessed were read off `pattern_attributes` in pattern
 *    *detail* responses, which do carry permalinks.
 * 2. The Age / Size / Fit tree is not addressed through `pa` at all — those
 *    values go through `fit`, and sending one to `pa` is a 500. Each group
 *    below carries the parameter it belongs to.
 *
 * Deliberately absent, because the endpoint ignores them however they are
 * spelled: difficulty, rating, project count, favourite count, price and fiber.
 * Ravelry's website filters on some of these; the API does not.
 */

export type FilterOption = {
  /** What the search endpoint accepts, verbatim. */
  readonly permalink: string;
  /** Ravelry's own wording, sentence case. */
  readonly label: string;
};

/** Which query parameter a group's values belong to. See the note above. */
export type AttributeParam = 'pa' | 'fit';

export type AttributeGroup = {
  readonly permalink: string;
  readonly label: string;
  readonly param: AttributeParam;
  readonly options: readonly FilterOption[];
  readonly children: readonly AttributeGroup[];
};

export type CategoryNode = {
  readonly permalink: string;
  readonly label: string;
  readonly children: readonly CategoryNode[];
};

/**
 * A `min|max` filter. Both ends are optional on screen; an open end is sent as
 * the bound below, because the endpoint wants both halves of the pair.
 */
export type RangeFilter = {
  readonly key: 'yardage' | 'needle-size' | 'hook-size' | 'gauge';
  readonly label: string;
  /** What the numbers mean, said in the knitter's units. */
  readonly unit: string;
  readonly floor: number;
  readonly ceiling: number;
};


/** The four crafts Ravelry files patterns under. */
export const CRAFTS: readonly FilterOption[] = [
  { permalink: 'knitting', label: 'Knitting' },
  { permalink: 'crochet', label: 'Crochet' },
  { permalink: 'machine-knitting', label: 'Machine knitting' },
  { permalink: 'loom-knitting', label: 'Loom knitting' },
];

/**
 * The category tree, all 207 of it, in Ravelry's own order — which is the
 * order the website's own category menu is in, not alphabetical.
 */
export const PATTERN_CATEGORIES: readonly CategoryNode[] = [
  {
    permalink: 'clothing',
    label: 'Clothing',
    children: [
      {
        permalink: 'shrug',
        label: 'Shrug / Bolero',
        children: [],
      },
      {
        permalink: 'vest',
        label: 'Vest',
        children: [],
      },
      {
        permalink: 'coat',
        label: 'Coat / Jacket',
        children: [],
      },
      {
        permalink: 'skirt',
        label: 'Skirt',
        children: [],
      },
      {
        permalink: 'shorts',
        label: 'Shorts',
        children: [],
      },
      {
        permalink: 'pants',
        label: 'Pants',
        children: [],
      },
      {
        permalink: 'leggings',
        label: 'Leggings',
        children: [],
      },
      {
        permalink: 'sweater',
        label: 'Sweater',
        children: [
          {
            permalink: 'cardigan',
            label: 'Cardigan',
            children: [],
          },
          {
            permalink: 'pullover',
            label: 'Pullover',
            children: [],
          },
          {
            permalink: 'other-sweater',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'soakers',
        label: 'Soakers',
        children: [],
      },
      {
        permalink: 'onesies',
        label: 'Onesies',
        children: [],
      },
      {
        permalink: 'dress',
        label: 'Dress',
        children: [],
      },
      {
        permalink: 'robe',
        label: 'Robe',
        children: [],
      },
      {
        permalink: 'intimateapparel',
        label: 'Intimate Apparel',
        children: [
          {
            permalink: 'underwear',
            label: 'Underwear',
            children: [],
          },
          {
            permalink: 'bra',
            label: 'Bra',
            children: [],
          },
          {
            permalink: 'pasties',
            label: 'Pasties',
            children: [],
          },
          {
            permalink: 'other-intimateapparel',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'sleepwear',
        label: 'Sleepwear',
        children: [],
      },
      {
        permalink: 'swimwear',
        label: 'Swimwear',
        children: [],
      },
      {
        permalink: 'other-clothing',
        label: 'Other',
        children: [],
      },
      {
        permalink: 'tops',
        label: 'Tops',
        children: [
          {
            permalink: 'tee',
            label: 'Tee',
            children: [],
          },
          {
            permalink: 'sleeveless-top',
            label: 'Sleeveless Top',
            children: [],
          },
          {
            permalink: 'strapless-top',
            label: 'Strapless Top',
            children: [],
          },
          {
            permalink: 'other-top',
            label: 'Other',
            children: [],
          },
        ],
      },
    ],
  },
  {
    permalink: 'accessories',
    label: 'Accessories',
    children: [
      {
        permalink: 'neck-torso',
        label: 'Neck / Torso',
        children: [
          {
            permalink: 'scarf',
            label: 'Scarf',
            children: [],
          },
          {
            permalink: 'cowl',
            label: 'Cowl',
            children: [],
          },
          {
            permalink: 'collar',
            label: 'Collar',
            children: [],
          },
          {
            permalink: 'necktie',
            label: 'Necktie',
            children: [],
          },
          {
            permalink: 'bib',
            label: 'Bib',
            children: [],
          },
          {
            permalink: 'cape',
            label: 'Cape',
            children: [],
          },
          {
            permalink: 'poncho',
            label: 'Poncho',
            children: [],
          },
          {
            permalink: 'shawl-wrap',
            label: 'Shawl / Wrap',
            children: [],
          },
          {
            permalink: 'other-neck-torso',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'feet-legs',
        label: 'Feet / Legs',
        children: [
          {
            permalink: 'socks',
            label: 'Socks',
            children: [
              {
                permalink: 'ankle-sock',
                label: 'Ankle',
                children: [],
              },
              {
                permalink: 'knee-highs',
                label: 'Knee-highs',
                children: [],
              },
              {
                permalink: 'thigh-high',
                label: 'Thigh-high',
                children: [],
              },
              {
                permalink: 'tube',
                label: 'Tube',
                children: [],
              },
              {
                permalink: 'toeless',
                label: 'Toeless',
                children: [],
              },
              {
                permalink: 'mid-calf',
                label: 'Mid-calf',
                children: [],
              },
              {
                permalink: 'other-socks',
                label: 'Other',
                children: [],
              },
            ],
          },
          {
            permalink: 'slippers',
            label: 'Slippers',
            children: [],
          },
          {
            permalink: 'booties',
            label: 'Booties',
            children: [],
          },
          {
            permalink: 'legwarmers',
            label: 'Legwarmers',
            children: [],
          },
          {
            permalink: 'spats',
            label: 'Spats',
            children: [],
          },
          {
            permalink: 'other-feet-legs',
            label: 'Other',
            children: [],
          },
          {
            permalink: 'boot-toppers',
            label: 'Boot Toppers',
            children: [],
          },
        ],
      },
      {
        permalink: 'belt',
        label: 'Belt',
        children: [],
      },
      {
        permalink: 'bag',
        label: 'Bag',
        children: [
          {
            permalink: 'clutch',
            label: 'Clutch',
            children: [],
          },
          {
            permalink: 'tote',
            label: 'Tote',
            children: [],
          },
          {
            permalink: 'purse',
            label: 'Purse / Handbag',
            children: [],
          },
          {
            permalink: 'wristlet',
            label: 'Wristlet',
            children: [],
          },
          {
            permalink: 'market',
            label: 'Market bag (slouchy)',
            children: [],
          },
          {
            permalink: 'laptop',
            label: 'Laptop',
            children: [],
          },
          {
            permalink: 'messenger',
            label: 'Messenger',
            children: [],
          },
          {
            permalink: 'backpack',
            label: 'Backpack',
            children: [],
          },
          {
            permalink: 'drawstring',
            label: 'Drawstring',
            children: [],
          },
          {
            permalink: 'duffle',
            label: 'Duffle',
            children: [],
          },
          {
            permalink: 'money',
            label: 'Money',
            children: [],
          },
          {
            permalink: 'other-bag',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'hands',
        label: 'Hands',
        children: [
          {
            permalink: 'mittens',
            label: 'Mittens',
            children: [],
          },
          {
            permalink: 'gloves',
            label: 'Gloves',
            children: [],
          },
          {
            permalink: 'fingerless',
            label: 'Fingerless Gloves/Mitts',
            children: [],
          },
          {
            permalink: 'convertible',
            label: 'Convertible',
            children: [],
          },
          {
            permalink: 'cuffs',
            label: 'Cuffs',
            children: [],
          },
          {
            permalink: 'muff',
            label: 'Muff',
            children: [],
          },
          {
            permalink: 'other-hands',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'headwear',
        label: 'Other Headwear',
        children: [
          {
            permalink: 'hairaccessories',
            label: 'Hair accessories',
            children: [],
          },
          {
            permalink: 'headband',
            label: 'Headband',
            children: [],
          },
          {
            permalink: 'snood',
            label: 'Snood',
            children: [],
          },
          {
            permalink: 'headwrap',
            label: 'Headwrap',
            children: [],
          },
          {
            permalink: 'earwarmers',
            label: 'Earwarmers',
            children: [],
          },
          {
            permalink: 'eyemask',
            label: 'Eye mask',
            children: [],
          },
          {
            permalink: 'kerchief',
            label: 'Kerchief',
            children: [],
          },
          {
            permalink: 'other-headwear',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'hat',
        label: 'Hat',
        children: [
          {
            permalink: 'beret-tam',
            label: 'Beret, Tam',
            children: [],
          },
          {
            permalink: 'beanie-toque',
            label: 'Beanie, Toque',
            children: [],
          },
          {
            permalink: 'bonnet',
            label: 'Bonnet',
            children: [],
          },
          {
            permalink: 'brimmed',
            label: 'Brimmed',
            children: [],
          },
          {
            permalink: 'billed',
            label: 'Billed',
            children: [],
          },
          {
            permalink: 'cloche',
            label: 'Cloche',
            children: [],
          },
          {
            permalink: 'balaclava',
            label: 'Balaclava',
            children: [],
          },
          {
            permalink: 'earflap',
            label: 'Earflap',
            children: [],
          },
          {
            permalink: 'pixie',
            label: 'Pixie',
            children: [],
          },
          {
            permalink: 'stocking',
            label: 'Stocking',
            children: [],
          },
          {
            permalink: 'yarmulke',
            label: 'Yarmulke',
            children: [],
          },
          {
            permalink: 'other-hat',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'jewelry',
        label: 'Jewelry',
        children: [
          {
            permalink: 'earrings',
            label: 'Earrings',
            children: [],
          },
          {
            permalink: 'necklace',
            label: 'Necklace',
            children: [],
          },
          {
            permalink: 'bracelet',
            label: 'Bracelet',
            children: [],
          },
          {
            permalink: 'brooch',
            label: 'Brooch',
            children: [],
          },
          {
            permalink: 'ring',
            label: 'Ring',
            children: [],
          },
          {
            permalink: 'ankle',
            label: 'Ankle',
            children: [],
          },
          {
            permalink: 'other-jewelry',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'other-accessories',
        label: 'Other',
        children: [],
      },
    ],
  },
  {
    permalink: 'medical',
    label: 'Medical',
    children: [],
  },
  {
    permalink: 'home',
    label: 'Home',
    children: [
      {
        permalink: 'blanket',
        label: 'Blanket',
        children: [
          {
            permalink: 'throw',
            label: 'Throw',
            children: [],
          },
          {
            permalink: 'bedspread',
            label: 'Bedspread',
            children: [],
          },
          {
            permalink: 'babyblanket',
            label: 'Baby Blanket',
            children: [],
          },
          {
            permalink: 'other-blanket',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'pillow',
        label: 'Pillow',
        children: [],
      },
      {
        permalink: 'tablesetting',
        label: 'Table Setting',
        children: [
          {
            permalink: 'tablerunner',
            label: 'Table Runner',
            children: [],
          },
          {
            permalink: 'tablecloth',
            label: 'Tablecloth',
            children: [],
          },
          {
            permalink: 'napkin',
            label: 'Napkin',
            children: [],
          },
          {
            permalink: 'placemat',
            label: 'Placemat',
            children: [],
          },
          {
            permalink: 'other-tablesetting',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'curtain',
        label: 'Curtain',
        children: [],
      },
      {
        permalink: 'coaster',
        label: 'Coaster',
        children: [],
      },
      {
        permalink: 'containers',
        label: 'Containers',
        children: [],
      },
      {
        permalink: 'sachet',
        label: 'Sachet',
        children: [],
      },
      {
        permalink: 'potholder',
        label: 'Potholder',
        children: [],
      },
      {
        permalink: 'rug',
        label: 'Rug',
        children: [],
      },
      {
        permalink: 'lampshade',
        label: 'Lampshade',
        children: [],
      },
      {
        permalink: 'cleaning',
        label: 'Cleaning',
        children: [
          {
            permalink: 'washcloth',
            label: 'Washcloth / Dishcloth',
            children: [],
          },
          {
            permalink: 'scrubber',
            label: 'Scrubber',
            children: [],
          },
          {
            permalink: 'towel',
            label: 'Towel',
            children: [],
          },
          {
            permalink: 'bathmitt',
            label: 'Bath Mitt',
            children: [],
          },
          {
            permalink: 'other-cleaning',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'cozy',
        label: 'Cozy',
        children: [
          {
            permalink: 'cup-mug',
            label: 'Cup / Mug',
            children: [],
          },
          {
            permalink: 'hotwaterbottle',
            label: 'Hot Water Bottle',
            children: [],
          },
          {
            permalink: 'lipbalm',
            label: 'Lip Balm',
            children: [],
          },
          {
            permalink: 'electronics',
            label: 'Electronics',
            children: [],
          },
          {
            permalink: 'foodcozy',
            label: 'Food Cozy',
            children: [],
          },
          {
            permalink: 'bookcover',
            label: 'Book Cover',
            children: [],
          },
          {
            permalink: 'tissueboxcover',
            label: 'Tissue Box Cover',
            children: [],
          },
          {
            permalink: 'automobile',
            label: 'Automobile',
            children: [],
          },
          {
            permalink: 'glassescase',
            label: 'Glasses Case',
            children: [],
          },
          {
            permalink: 'hangercover',
            label: 'Hanger Cover',
            children: [],
          },
          {
            permalink: 'bathroom',
            label: 'Bathroom',
            children: [],
          },
          {
            permalink: 'maturecontenttoys',
            label: 'Mature Content Toys',
            children: [],
          },
          {
            permalink: 'sportsequipment',
            label: 'Sports Equipment',
            children: [],
          },
          {
            permalink: 'coffee-teapot',
            label: 'Coffee / Tea Pot',
            children: [],
          },
          {
            permalink: 'other-cozy',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'bookmark',
        label: 'Bookmark',
        children: [],
      },
      {
        permalink: 'decorative',
        label: 'Decorative',
        children: [
          {
            permalink: 'doily',
            label: 'Doily',
            children: [],
          },
          {
            permalink: 'ornamentalflower',
            label: 'Ornamental Flower',
            children: [],
          },
          {
            permalink: 'hangingornament',
            label: 'Hanging Ornament',
            children: [],
          },
          {
            permalink: 'wallhanging',
            label: 'Wall Hanging',
            children: [],
          },
          {
            permalink: 'wreath',
            label: 'Wreath',
            children: [],
          },
          {
            permalink: 'christmasstocking',
            label: 'Christmas Stocking',
            children: [],
          },
          {
            permalink: 'pictureframe',
            label: 'Picture Frame',
            children: [],
          },
          {
            permalink: 'other-decorative',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'other-home',
        label: 'Other',
        children: [],
      },
    ],
  },
  {
    permalink: 'toysandhobbies',
    label: 'Toys and Hobbies',
    children: [
      {
        permalink: 'softies',
        label: 'Softies',
        children: [
          {
            permalink: 'doll',
            label: 'Doll',
            children: [],
          },
          {
            permalink: 'animal',
            label: 'Animal',
            children: [],
          },
          {
            permalink: 'plant',
            label: 'Plant',
            children: [],
          },
          {
            permalink: 'vehicle',
            label: 'Vehicle',
            children: [],
          },
          {
            permalink: 'other-softies',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'dollclothes',
        label: 'Doll Clothes',
        children: [
          {
            permalink: 'fashion-doll',
            label: 'Fashion doll',
            children: [],
          },
          {
            permalink: 'child-doll',
            label: 'Child Doll',
            children: [],
          },
          {
            permalink: 'baby-doll',
            label: 'Baby Doll',
            children: [],
          },
          {
            permalink: 'other-dollclothes',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'food',
        label: 'Food',
        children: [],
      },
      {
        permalink: 'puppet',
        label: 'Puppet',
        children: [],
      },
      {
        permalink: 'mobile',
        label: 'Mobile',
        children: [],
      },
      {
        permalink: 'game',
        label: 'Game',
        children: [],
      },
      {
        permalink: 'ball',
        label: 'Ball',
        children: [],
      },
      {
        permalink: 'blocks',
        label: 'Blocks',
        children: [],
      },
      {
        permalink: 'costume',
        label: 'Costume',
        children: [],
      },
      {
        permalink: 'maturecontent',
        label: 'Mature Content',
        children: [],
      },
      {
        permalink: 'craft',
        label: 'Craft',
        children: [
          {
            permalink: 'needleholder',
            label: 'Needle Holder',
            children: [],
          },
          {
            permalink: 'crochethookholder',
            label: 'Crochet Hook Holder',
            children: [],
          },
          {
            permalink: 'pincushion',
            label: 'Pin Cushion',
            children: [],
          },
          {
            permalink: 'tapemeasurecover',
            label: 'Tape Measure Cover',
            children: [],
          },
          {
            permalink: 'other-craft',
            label: 'Other',
            children: [],
          },
        ],
      },
      {
        permalink: 'other-toysandhobbies',
        label: 'Other',
        children: [],
      },
    ],
  },
  {
    permalink: 'pet',
    label: 'Pet',
    children: [
      {
        permalink: 'pet-clothing',
        label: 'Clothing',
        children: [],
      },
      {
        permalink: 'bedding',
        label: 'Bedding',
        children: [],
      },
      {
        permalink: 'accessory',
        label: 'Accessory',
        children: [],
      },
      {
        permalink: 'toys',
        label: 'Toys',
        children: [],
      },
      {
        permalink: 'other-pet',
        label: 'Other',
        children: [],
      },
    ],
  },
  {
    permalink: 'pattern-component',
    label: 'Components',
    children: [
      {
        permalink: 'tutorial',
        label: 'Tutorial',
        children: [],
      },
      {
        permalink: 'edging',
        label: 'Edging',
        children: [],
      },
      {
        permalink: 'insertion',
        label: 'Insertion',
        children: [],
      },
      {
        permalink: 'button',
        label: 'Button',
        children: [],
      },
      {
        permalink: 'frog',
        label: 'Frog',
        children: [],
      },
      {
        permalink: 'afghanblock',
        label: 'Afghan block',
        children: [],
      },
      {
        permalink: 'floralblock',
        label: 'Floral block',
        children: [],
      },
      {
        permalink: 'stitchpattern',
        label: 'Stitch pattern',
        children: [],
      },
      {
        permalink: 'chart',
        label: 'Chart',
        children: [],
      },
      {
        permalink: 'other-x-notapattern',
        label: 'Other',
        children: [],
      },
      {
        permalink: 'applique',
        label: 'Applique / Embellishment',
        children: [],
      },
    ],
  },
];

/** Every attribute facet, grouped as Ravelry groups them. */
export const ATTRIBUTE_GROUPS: readonly AttributeGroup[] = [
  {
    permalink: 'accessibility',
    label: 'Accessibility',
    param: 'pa',
    options: [
      { permalink: 'adaptive', label: 'Adaptive design' },
      { permalink: 'medical-device-access', label: 'Medical device access' },
      { permalink: 'medical-device-accessory', label: 'Medical device support' },
      { permalink: 'mobility-aid-accessory', label: 'Mobility aid support' },
      { permalink: 'therapy-aid', label: 'Therapy aid/toy' },
      { permalink: 'other-accessibility', label: 'Other' },
    ],
    children: [],
  },
  {
    permalink: 'fit',
    label: 'Age / Size / Fit',
    param: 'fit',
    options: [],
    children: [
      {
        permalink: 'size',
        label: 'Age or Size',
        param: 'fit',
        options: [
          { permalink: 'doll-size', label: 'Doll' },
          { permalink: 'preemie', label: 'Preemie' },
          { permalink: 'newborn-size', label: 'Newborn' },
          { permalink: 'baby', label: 'Baby' },
          { permalink: 'toddler', label: 'Toddler (1-3)' },
          { permalink: 'child', label: 'Child (4-12)' },
          { permalink: 'teen', label: 'Teen (13-17)' },
          { permalink: 'adult', label: 'Adult' },
        ],
        children: [],
      },
      {
        permalink: 'ease',
        label: 'Ease',
        param: 'fit',
        options: [
          { permalink: 'negative-ease', label: 'Negative ease' },
          { permalink: 'no-ease', label: 'No ease' },
          { permalink: 'positive-ease', label: 'Positive ease' },
        ],
        children: [],
      },
      {
        permalink: 'fit',
        label: 'Fit',
        param: 'fit',
        options: [
          { permalink: 'fitted', label: 'Fitted' },
          { permalink: 'maternity', label: 'Maternity fit' },
          { permalink: 'miniature', label: 'Miniature' },
          { permalink: 'oversized', label: 'Oversized fit' },
          { permalink: 'petite', label: 'Petite fit' },
          { permalink: 'plus', label: 'Plus fit' },
          { permalink: 'tall', label: 'Tall fit' },
        ],
        children: [],
      },
      {
        permalink: 'gender',
        label: 'Gender',
        param: 'fit',
        options: [
          { permalink: 'female', label: 'Female' },
          { permalink: 'male', label: 'Male' },
          { permalink: 'unisex', label: 'Unisex' },
        ],
        children: [],
      },
    ],
  },
  {
    permalink: 'colorwork',
    label: 'Colorwork',
    param: 'pa',
    options: [
      { permalink: 'corrugated-ribbing', label: 'Corrugated ribbing' },
      { permalink: 'illusion', label: 'Illusion/shadow' },
      { permalink: 'Intarsia', label: 'Intarsia' },
      { permalink: 'mosaic', label: 'Mosaic' },
      { permalink: 'other-colorwork', label: 'Other' },
      { permalink: 'stranded', label: 'Stranded' },
      { permalink: 'stripes-colorwork', label: 'Stripes / colorwork' },
    ],
    children: [],
  },
  {
    permalink: 'construction',
    label: 'Construction',
    param: 'pa',
    options: [
      { permalink: 'bias', label: 'Bias' },
      { permalink: 'bottom-up', label: 'Bottom up' },
      { permalink: 'buttonholes', label: 'Buttonholes' },
      { permalink: 'doubleknit', label: 'Double knitting' },
      { permalink: 'entrelac', label: 'Entrelac' },
      { permalink: 'felted', label: 'Felted/fulled' },
      { permalink: 'freeform', label: 'Freeform' },
      { permalink: 'gusset', label: 'Gusset' },
      { permalink: 'icord', label: 'Icord' },
      { permalink: 'kitchener', label: 'Kitchener/grafting' },
      { permalink: 'modular', label: 'Modular / join as you go' },
      { permalink: 'moebius', label: 'Moebius' },
      { permalink: 'motifs', label: 'Motifs' },
      { permalink: 'one-piece', label: 'One-piece' },
      { permalink: 'provisional', label: 'Provisional cast-on' },
      { permalink: 'seamed', label: 'Seamed' },
      { permalink: 'seamless', label: 'Seamless' },
      { permalink: 'selvedge', label: 'Selvedge' },
      { permalink: 'short-rows', label: 'Short rows' },
      { permalink: 'sideways', label: 'Sideways' },
      { permalink: 'steeks', label: 'Steeks' },
      { permalink: 'three-needle-bind', label: 'Three needle bind off' },
      { permalink: 'thrums', label: 'Thrums' },
      { permalink: 'top-down', label: 'Top down' },
      { permalink: 'twined', label: 'Twined knitting' },
      { permalink: 'worked-flat', label: 'Worked flat' },
      { permalink: 'in-the-round', label: 'Worked in the round' },
    ],
    children: [],
  },
  {
    permalink: 'crochet',
    label: 'Crochet Techniques',
    param: 'pa',
    options: [
      { permalink: 'broomstick', label: 'Broomstick crochet' },
      { permalink: 'bruges', label: 'Bruges crochet' },
      { permalink: 'bullion', label: 'Bullion / roll stitch' },
      { permalink: 'clones', label: 'Clones knot' },
      { permalink: 'crohook', label: 'Cro-hook / croknit' },
      { permalink: 'crotat', label: 'Cro-tatting / crochet' },
      { permalink: 'filet-crochet', label: 'Filet crochet' },
      { permalink: 'post-stitch', label: 'Front/back post stitch' },
      { permalink: 'granny-square', label: 'Granny square' },
      { permalink: 'hairpin-crochet', label: 'Hairpin crochet' },
      { permalink: 'irish-crochet', label: 'Irish crochet' },
      { permalink: 'lovers', label: 'Lover\'s knot/Solomon\'s knot/knot stitch' },
      { permalink: 'pineapple', label: 'Pineapple crochet' },
      { permalink: 'slip-stitch', label: 'Slip stitch crochet' },
      { permalink: 'surface-crochet', label: 'Surface crochet' },
      { permalink: 'tapestry-crochet', label: 'Tapestry crochet' },
      { permalink: 'tunisian', label: 'Tunisian / afghan crochet' },
    ],
    children: [],
  },
  {
    permalink: 'design',
    label: 'Design Elements',
    param: 'pa',
    options: [
      { permalink: 'aline', label: 'A line' },
      { permalink: 'appliqued', label: 'Appliqued / embellished' },
      { permalink: 'asymmetric', label: 'Asymmetric' },
      { permalink: 'backfastening', label: 'Back fastening' },
      { permalink: 'beads', label: 'Beads / pailettes' },
      { permalink: 'box-pleats', label: 'Box pleats' },
      { permalink: 'braids-plaiting', label: 'Braids / plaiting' },
      { permalink: 'buttoned', label: 'Buttoned' },
      { permalink: 'circular-yoke', label: 'Circular yoke' },
      { permalink: 'convertible', label: 'Convertible' },
      { permalink: 'cropped', label: 'Cropped' },
      { permalink: 'darts', label: 'Darts' },
      { permalink: 'doublebreasted', label: 'Double breasted' },
      { permalink: 'duplicate-stitch', label: 'Duplicate stitch' },
      { permalink: 'embroidery', label: 'Embroidery' },
      { permalink: 'empire', label: 'Empire waist' },
      { permalink: 'facings', label: 'Facings' },
      { permalink: 'fringe', label: 'Fringe' },
      { permalink: 'front-fastening', label: 'Front fastening' },
      { permalink: 'gathers', label: 'Gathers' },
      { permalink: 'hems', label: 'Hems' },
      { permalink: 'hood', label: 'Hood' },
      { permalink: 'lined', label: 'Lined' },
      { permalink: 'notched', label: 'Notched' },
      { permalink: 'peplum', label: 'Peplum' },
      { permalink: 'picots', label: 'Picots' },
      { permalink: 'pleated', label: 'Pleated' },
      { permalink: 'racerback', label: 'Racer back' },
      { permalink: 'ruffles', label: 'Ruffles' },
      { permalink: 'shoulder-fastening', label: 'Shoulder fastening' },
      { permalink: 'single-breasted', label: 'Single breasted' },
      { permalink: 'snaps', label: 'Snaps' },
      { permalink: 'straight', label: 'Straight' },
      { permalink: 'stripes', label: 'Stripes' },
      { permalink: 'swing', label: 'Swing' },
      { permalink: 'tassel', label: 'Tassel / pompom' },
      { permalink: 'tied', label: 'Tied' },
      { permalink: 'waist', label: 'Waist shaping' },
      { permalink: 'wrap', label: 'Wrap' },
      { permalink: 'zipper', label: 'Zipper' },
    ],
    children: [
      {
        permalink: 'collar',
        label: 'Collar',
        param: 'pa',
        options: [
          { permalink: 'mandarin', label: 'Mandarin' },
          { permalink: 'peterpan', label: 'Peter pan' },
          { permalink: 'rolled', label: 'Rolled' },
          { permalink: 'shawl', label: 'Shawl collar' },
          { permalink: 'shirt-collar', label: 'Shirt' },
          { permalink: 'collar', label: 'Collared' },
        ],
        children: [],
      },
      {
        permalink: 'edging',
        label: 'Edging',
        param: 'pa',
        options: [
          { permalink: 'crocheted-edging', label: 'Crocheted edging' },
          { permalink: 'icord-edging', label: 'Icord edging' },
          { permalink: 'lace-edging', label: 'Lace edging' },
          { permalink: 'other-edging', label: 'Other edging' },
        ],
        children: [],
      },
      {
        permalink: 'neck',
        label: 'Neck',
        param: 'pa',
        options: [
          { permalink: 'ballet-neck', label: 'Ballet neck' },
          { permalink: 'boat-neck', label: 'Boat neck' },
          { permalink: 'cowl-neck', label: 'Cowl neck' },
          { permalink: 'crew-neck', label: 'Crew neck' },
          { permalink: 'funnel-neck', label: 'Funnel neck' },
          { permalink: 'halter-neck', label: 'Halter' },
          { permalink: 'henley-neck', label: 'Henley' },
          { permalink: 'keyhole-neck', label: 'Keyhole neck' },
          { permalink: 'mock-turtleneck', label: 'Mock turtle' },
          { permalink: 'scoop-neck', label: 'Scoop neck' },
          { permalink: 'square-neck', label: 'Square neck' },
          { permalink: 'surplice-neck', label: 'Surplice' },
          { permalink: 'sweetheart-neck', label: 'Sweetheart neck' },
          { permalink: 'turtleneck', label: 'Turtle neck' },
          { permalink: 'v-neck', label: 'V neck' },
        ],
        children: [],
      },
      {
        permalink: 'pocket',
        label: 'Pocket',
        param: 'pa',
        options: [
          { permalink: 'afterthought-pocket', label: 'Afterthought pocket' },
          { permalink: 'hidden-pocket', label: 'Hidden / inseam' },
          { permalink: 'patch-pocket', label: 'Patch' },
          { permalink: 'set-in-pocket', label: 'Set-in' },
          { permalink: 'tubular-pocket', label: 'Tubular' },
          { permalink: 'pockets', label: 'Any pockets' },
        ],
        children: [],
      },
      {
        permalink: 'sleeve',
        label: 'Sleeve',
        param: 'pa',
        options: [
          { permalink: '3', label: '3/4 length' },
          { permalink: 'bracelet-sleeve', label: 'Bracelet length' },
          { permalink: 'cap-sleeve', label: 'Cap' },
          { permalink: 'contiguous', label: 'Contiguous' },
          { permalink: 'cuffed-sleeve', label: 'Cuffed' },
          { permalink: 'dolman-sleeve', label: 'Dolman' },
          { permalink: 'drop-sleeve', label: 'Drop' },
          { permalink: 'elbow-sleeve', label: 'Elbow' },
          { permalink: 'flutter-sleeve', label: 'Flutter' },
          { permalink: 'long-sleeve', label: 'Long' },
          { permalink: 'modified-drop-sleeve', label: 'Modified drop' },
          { permalink: 'nalgar-sleeve', label: 'Nalgar (EZ notation)' },
          { permalink: 'puffed-sleeve', label: 'Puffed' },
          { permalink: 'raglan-sleeve', label: 'Raglan' },
          { permalink: 'saddle-shoulder', label: 'Saddle shoulder' },
          { permalink: 'set-in-sleeve', label: 'Set in' },
          { permalink: 'short-sleeve', label: 'Short' },
          { permalink: 'tulip-sleeve', label: 'Tulip' },
          { permalink: 'sleeves', label: 'Any sleeves' },
          { permalink: 'sleeveless', label: 'Sleeveless' },
        ],
        children: [],
      },
    ],
  },
  {
    permalink: 'fabric',
    label: 'Fabric Characteristics',
    param: 'pa',
    options: [
      { permalink: 'bobble-or-popcorn', label: 'Bobble / popcorn / nupp' },
      { permalink: 'brioche-tuck', label: 'Brioche / tuck stitch' },
      { permalink: 'cables', label: 'Cables' },
      { permalink: 'chevron', label: 'Chevron / flame stitch' },
      { permalink: 'dropped-stitches', label: 'Dropped stitches' },
      { permalink: 'elastic', label: 'Elastic' },
      { permalink: 'eyelets', label: 'Eyelets' },
      { permalink: 'lace', label: 'Lace' },
      { permalink: 'mesh', label: 'Mesh' },
      { permalink: 'reversible', label: 'Reversible' },
      { permalink: 'ribbed', label: 'Ribbed / ribbing' },
      { permalink: 'ripple', label: 'Ripple' },
      { permalink: 'slipped-stitches', label: 'Slipped stitches' },
      { permalink: 'smocked', label: 'Smocked' },
      { permalink: 'textured', label: 'Textured' },
      { permalink: 'twisted-stitches', label: 'Twisted stitches' },
    ],
    children: [],
  },
  {
    permalink: 'special',
    label: 'Mature Content',
    param: 'pa',
    options: [
      { permalink: 'mature', label: 'Mature Content' },
    ],
    children: [],
  },
  {
    permalink: 'instructions',
    label: 'Pattern Instructions',
    param: 'pa',
    options: [
      { permalink: 'captioned-video', label: 'Captioned video' },
      { permalink: 'chart', label: 'Chart' },
      { permalink: 'color-blind-accessible', label: 'Color blind accessible' },
      { permalink: 'digital-audio', label: 'Digital audio' },
      { permalink: 'digital-braille', label: 'Digital braille' },
      { permalink: 'schematic', label: 'Has schematic' },
      { permalink: 'low-vision', label: 'Low vision' },
      { permalink: 'machine-instructions', label: 'Machine instructions' },
      { permalink: 'phototutorial', label: 'Photo tutorial' },
      { permalink: 'press-braille', label: 'Press braille' },
      { permalink: 'pattern-recipe', label: 'Recipe - percentage / calculated' },
      { permalink: 'screen-reader', label: 'Screen reader access' },
      { permalink: 'video-tutorial', label: 'Video tutorial' },
      { permalink: 'written-pattern', label: 'Written pattern' },
    ],
    children: [],
  },
  {
    permalink: 'regional',
    label: 'Regional/Ethnic Styles',
    param: 'pa',
    options: [
      { permalink: 'amigurumi', label: 'Amigurumi' },
      { permalink: 'andean', label: 'Andean / Peruvian' },
      { permalink: 'aran', label: 'Aran' },
      { permalink: 'bavarian', label: 'Bavarian' },
      { permalink: 'cowichan', label: 'Cowichan (Salish)' },
      { permalink: 'danish', label: 'Danish' },
      { permalink: 'estonian', label: 'Estonian' },
      { permalink: 'fairisle', label: 'Fair Isle' },
      { permalink: 'faroese', label: 'Faroese' },
      { permalink: 'finnish', label: 'Finnish / Suomi' },
      { permalink: 'guernsey', label: 'Guernsey / Gansey' },
      { permalink: 'icelandic', label: 'Icelandic' },
      { permalink: 'irish', label: 'Irish' },
      { permalink: 'latvian', label: 'Latvian' },
      { permalink: 'norwegian', label: 'Norwegian' },
      { permalink: 'orenburg', label: 'Orenburg' },
      { permalink: 'sami', label: 'Sami' },
      { permalink: 'Shetland', label: 'Shetland' },
      { permalink: 'swedish', label: 'Swedish' },
      { permalink: 'turkish', label: 'Turkish' },
    ],
    children: [],
  },
  {
    permalink: 'shapes',
    label: 'Shapes',
    param: 'pa',
    options: [
      { permalink: '3-dimensional', label: '3 dimensional' },
      { permalink: 'circle-shaped', label: 'Circle' },
      { permalink: 'crescent-shape', label: 'Crescent' },
      { permalink: 'cube-shaped', label: 'Cube' },
      { permalink: 'halfcircle-shape', label: 'Half-circle' },
      { permalink: 'hexagon', label: 'Hexagon' },
      { permalink: 'octagon', label: 'Octagon' },
      { permalink: 'oval', label: 'Oval' },
      { permalink: 'pentagon-shape', label: 'Pentagon' },
      { permalink: 'pyramid', label: 'Pyramid' },
      { permalink: 'rectangle', label: 'Rectangle' },
      { permalink: 'sphere-shaped', label: 'Sphere' },
      { permalink: 'square', label: 'Square' },
      { permalink: 'star-shaped', label: 'Star' },
      { permalink: 'triangle-shaped', label: 'Triangle' },
    ],
    children: [],
  },
  {
    permalink: 'sock',
    label: 'Sock Techniques',
    param: 'pa',
    options: [
      { permalink: 'noshaping', label: 'No shaping' },
      { permalink: 'seamed-sock', label: 'Seamed sock' },
      { permalink: 'shaped-arches', label: 'Shaped arches' },
      { permalink: 'start-in-middle', label: 'Starting in middle' },
      { permalink: 'toe-up', label: 'Toe up' },
      { permalink: 'top-cuff-down', label: 'Top/cuff down' },
      { permalink: '2-at-a-time', label: 'Two at a time' },
    ],
    children: [
      {
        permalink: 'heel',
        label: 'Heel',
        param: 'pa',
        options: [
          { permalink: 'afterthought-heel', label: 'Afterthought heel' },
          { permalink: 'dutch-heel', label: 'Dutch heel' },
          { permalink: 'heel-flap', label: 'Heel flap' },
          { permalink: 'other-heel', label: 'Other heel' },
          { permalink: 'short-row-heel', label: 'Short row heel' },
        ],
        children: [],
      },
      {
        permalink: 'toe',
        label: 'Toe',
        param: 'pa',
        options: [
          { permalink: 'other-toe', label: 'Other' },
          { permalink: 'short-row-toe', label: 'Short row toe' },
          { permalink: 'star-toe', label: 'Star' },
          { permalink: 'wide-toe', label: 'Wide' },
        ],
        children: [],
      },
    ],
  },
];

/**
 * Where a pattern can be had. Ravelry also documents `instore`, `purchase`,
 * `library` and `subscription`; all four answer 200 with zero results for
 * every search tried, so they are left off rather than offered as a filter
 * that always empties the grid.
 */
export const AVAILABILITY: readonly FilterOption[] = [
  { permalink: 'free', label: 'Free' },
  { permalink: 'ravelry', label: 'Ravelry download' },
  { permalink: 'online', label: 'Online store' },
  { permalink: 'discontinued', label: 'Discontinued' },
];

/**
 * Where a pattern was published. The search endpoint's vocabulary here is
 * narrower than `/pattern_source_types/list.json` — `pamphlet`, `ebook`,
 * `app` and `ravelry-store` are all 500s — so these five are the whole set.
 */
export const SOURCE_TYPES: readonly FilterOption[] = [
  { permalink: 'book', label: 'Book' },
  { permalink: 'magazine', label: 'Magazine' },
  { permalink: 'booklet', label: 'Booklet' },
  { permalink: 'website', label: 'Website' },
  { permalink: 'webzine', label: 'Webzine' },
];

/** Written in, most-published first rather than alphabetically. */
export const LANGUAGES: readonly FilterOption[] = [
  { permalink: 'en', label: 'English' },
  { permalink: 'fr', label: 'French' },
  { permalink: 'de', label: 'German' },
  { permalink: 'nl', label: 'Dutch' },
  { permalink: 'no', label: 'Norwegian' },
  { permalink: 'es', label: 'Spanish' },
  { permalink: 'da', label: 'Danish' },
  { permalink: 'sv', label: 'Swedish' },
  { permalink: 'fi', label: 'Finnish' },
  { permalink: 'it', label: 'Italian' },
  { permalink: 'ja', label: 'Japanese' },
  { permalink: 'pl', label: 'Polish' },
  { permalink: 'cs', label: 'Czech' },
  { permalink: 'pt', label: 'Portuguese' },
  { permalink: 'is', label: 'Icelandic' },
  { permalink: 'ru', label: 'Russian' },
  { permalink: 'hu', label: 'Hungarian' },
  { permalink: 'et', label: 'Estonian' },
  { permalink: 'u', label: 'Universal (no written language)' },
  { permalink: 'kr', label: 'Korean' },
  { permalink: 'tr', label: 'Turkish' },
  { permalink: 'uk', label: 'Ukrainian' },
  { permalink: 'zh', label: 'Chinese' },
  { permalink: 'af', label: 'Afrikaans' },
  { permalink: 'sk', label: 'Slovak' },
  { permalink: 'el', label: 'Greek' },
  { permalink: 'lv', label: 'Latvian' },
  { permalink: 'he', label: 'Hebrew' },
  { permalink: 'id', label: 'Indonesian' },
  { permalink: 'sr', label: 'Serbian' },
  { permalink: 'hr', label: 'Croatian' },
  { permalink: 'ar', label: 'Arabic' },
  { permalink: 'ro', label: 'Romanian' },
  { permalink: 'lt', label: 'Lithuanian' },
  { permalink: 'fo', label: 'Faroese' },
  { permalink: 'ga', label: 'Irish' },
  { permalink: 'ca', label: 'Catalan' },
  { permalink: 'pr', label: 'Persian' },
  { permalink: 'hi', label: 'Hindi' },
  { permalink: 'gl', label: 'Galician' },
  { permalink: 'ms', label: 'Malay' },
  { permalink: 'cy', label: 'Welsh' },
  { permalink: 'ur', label: 'Urdu' },
];

/**
 * How the grid is ordered. Every value here was checked by watching the
 * first page change; a `sort` the endpoint does not know is not an error,
 * it is silently ignored, which is the worst way for a control to fail.
 */
export const SORTS: readonly FilterOption[] = [
  { permalink: 'best', label: 'Best match' },
  { permalink: 'recently-popular', label: 'Recently popular' },
  { permalink: 'popularity', label: 'Most popular' },
  { permalink: 'projects', label: 'Most projects' },
  { permalink: 'favorites', label: 'Most favourites' },
  { permalink: 'rating', label: 'Highest rated' },
  { permalink: 'date', label: 'Newest' },
  { permalink: 'difficulty', label: 'Easiest first' },
  { permalink: 'name', label: 'A to Z' },
];

/** `photo=yes|no`: whether the pattern has a photograph at all. */
export const PHOTO_OPTIONS: readonly FilterOption[] = [
  { permalink: 'yes', label: 'Has a photo' },
  { permalink: 'no', label: 'No photo' },
];

/**
 * The four numeric filters. Gauge is stitches over four inches, which is
 * how Ravelry stores it and how the distribution reads: a knitted hat peaks
 * around 18–24, not around 5.
 */
export const RANGE_FILTERS: readonly RangeFilter[] = [
  { key: 'yardage', label: 'Yardage', unit: 'yards', floor: 0, ceiling: 5000 },
  { key: 'needle-size', label: 'Needle size', unit: 'mm', floor: 0.25, ceiling: 40 },
  { key: 'hook-size', label: 'Hook size', unit: 'mm', floor: 0.25, ceiling: 40 },
  // "inches" written out rather than a prime mark: U+2033 is not in Solway and
  // would fall through to whatever the system substitutes, which is a different
  // typeface in the middle of a hint line. See `Mark` in `filter-sheet.tsx`.
  { key: 'gauge', label: 'Gauge', unit: 'stitches per 4 inches', floor: 0, ceiling: 60 },
];
