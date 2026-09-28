import { CountryData } from '../types/game';

export const COUNTRIES: CountryData[] = [
  {
    code: 'TN',
    name: 'Tunisia',
    flag: '🇹🇳',
    capital: 'Tunis',
    continent: 'Africa',
    languages: ['Arabic', 'Tunisian Darija', 'French'],
    traditionalFoods: ['Couscous with Grouper', 'Brik à l’oeuf', 'Lablabi', 'Ojja Merguez'],
    landmarks: ['Amphitheatre of El Jem', 'Carthage Ruins', 'Sidi Bou Said', 'Matmata Troglodyte Houses'],
    facts: [
      'Tunisia is home to the ancient city of Carthage, one of the greatest civilizations of antiquity.',
      'Sidi Bou Said is globally renowned for its whitewashed architecture and vibrant blue doors.',
      'Scenes from Star Wars were filmed in the Tunisian desert and towns like Tataouine.',
      'Olive cultivation in Tunisia dates back thousands of years; it is one of the world’s leading olive oil producers.'
    ],
    badgeTitle: 'Carthage Pioneer',
    population: '12.4 Million',
    mapCoords: { x: 51, y: 38 }
  },
  {
    code: 'JP',
    name: 'Japan',
    flag: '🇯🇵',
    capital: 'Tokyo',
    continent: 'Asia',
    languages: ['Japanese'],
    traditionalFoods: ['Ramen', 'Sushi', 'Okonomiyaki', 'Tempura', 'Matcha Sweets'],
    landmarks: ['Mount Fuji', 'Fushimi Inari Shrine', 'Kinkaku-ji (Golden Pavilion)', 'Shibuya Crossing'],
    facts: [
      'Japan consists of over 6,800 islands, with Honshu being the largest.',
      'Cherry blossom season (Hanami) is a centuries-old tradition celebrated nationwide.',
      'Japan is renowned for bullet trains (Shinkansen) that travel smoothly up to 320 km/h.',
      'The concept of "Omotenashi" embodies Japan’s deep philosophy of selfless hospitality.'
    ],
    badgeTitle: 'Rising Sun Master',
    population: '125 Million',
    mapCoords: { x: 86, y: 40 }
  },
  {
    code: 'FR',
    name: 'France',
    flag: '🇫🇷',
    capital: 'Paris',
    continent: 'Europe',
    languages: ['French'],
    traditionalFoods: ['Croissant', 'Bouillabaisse', 'Coq au Vin', 'Crêpes Bretonnes'],
    landmarks: ['Eiffel Tower', 'Louvre Museum', 'Mont Saint-Michel', 'Palace of Versailles'],
    facts: [
      'French gastronomy is inscribed on the UNESCO Intangible Cultural Heritage list.',
      'France is the most visited country in the world by international tourists.',
      'The country spans 12 different time zones when counting its overseas territories.',
      'Mont Blanc in the French Alps is the highest peak in Western Europe.'
    ],
    badgeTitle: 'Hexagon Connoisseur',
    population: '68 Million',
    mapCoords: { x: 48, y: 33 }
  },
  {
    code: 'BR',
    name: 'Brazil',
    flag: '🇧🇷',
    capital: 'Brasília',
    continent: 'Americas',
    languages: ['Portuguese'],
    traditionalFoods: ['Feijoada', 'Pão de Queijo', 'Moqueca', 'Açaí na Tigela'],
    landmarks: ['Christ the Redeemer', 'Iguazu Falls', 'Amazon Rainforest', 'Sugarloaf Mountain'],
    facts: [
      'Brazil is the largest country in South America and fifth largest in the world.',
      'The Amazon River basin holds the greatest biodiversity of plant and animal species on Earth.',
      'Rio de Janeiro hosts the world-famous Carnival, featuring grand Samba school parades.',
      'Brazil is the only nation to have played in every single FIFA World Cup and won five titles.'
    ],
    badgeTitle: 'Samba Voyager',
    population: '215 Million',
    mapCoords: { x: 34, y: 68 }
  },
  {
    code: 'KR',
    name: 'South Korea',
    flag: '🇰🇷',
    capital: 'Seoul',
    continent: 'Asia',
    languages: ['Korean'],
    traditionalFoods: ['Kimchi', 'Bibimbap', 'Korean BBQ', 'Tteokbokki', 'Samgyeopsal'],
    landmarks: ['Gyeongbokgung Palace', 'N Seoul Tower', 'Jeju Island', 'Bukchon Hanok Village'],
    facts: [
      'Hangul, the Korean alphabet, was deliberately engineered in 1443 by King Sejong the Great for universal literacy.',
      'South Korea is a global cultural powerhouse through K-Pop, K-Dramas, and cinema (Hallyu wave).',
      'Jeju Island features volcanic lava tubes and dormant Mount Hallasan, Korea’s highest peak.',
      'Sharing meals and side dishes (Banchan) is central to Korean hospitality and bonding.'
    ],
    badgeTitle: 'Hallyu Star',
    population: '51.7 Million',
    mapCoords: { x: 83, y: 40 }
  },
  {
    code: 'EG',
    name: 'Egypt',
    flag: '🇪🇬',
    capital: 'Cairo',
    continent: 'Africa',
    languages: ['Arabic', 'Egyptian Arabic'],
    traditionalFoods: ['Koshary', 'Ful Medames', 'Molokhia', 'Hawawshi'],
    landmarks: ['Great Pyramids of Giza', 'The Sphinx', 'Valley of the Kings', 'Abu Simbel'],
    facts: [
      'The Nile River is the lifeblood of Egypt, sustaining one of humanity’s earliest recorded civilizations.',
      'The Great Pyramid of Giza is the oldest of the Seven Wonders of the Ancient World and the only one still largely intact.',
      'Alexandria once housed the greatest library of antiquity and the legendary Pharos lighthouse.',
      'Traditional Egyptian music features the oud, nay, and riq percussion.'
    ],
    badgeTitle: 'Pharaoh Chronicler',
    population: '110 Million',
    mapCoords: { x: 55, y: 41 }
  },
  {
    code: 'IT',
    name: 'Italy',
    flag: '🇮🇹',
    capital: 'Rome',
    continent: 'Europe',
    languages: ['Italian'],
    traditionalFoods: ['Neapolitan Pizza', 'Risotto alla Milanese', 'Gelato', 'Lasagna'],
    landmarks: ['Colosseum', 'Canals of Venice', 'Florence Duomo', 'Tower of Pisa'],
    facts: [
      'Italy has the highest number of UNESCO World Heritage Sites of any country in the world (59 sites).',
      'The Vatican City and San Marino are two independent sovereign states completely enclaved within Italy.',
      'The Renaissance began in Florence during the 14th century, transforming European arts and sciences.',
      'Espresso culture follows unwritten rules, such as rarely drinking cappuccino after 11 a.m.'
    ],
    badgeTitle: 'Dolce Vita Explorer',
    population: '59 Million',
    mapCoords: { x: 51, y: 35 }
  },
  {
    code: 'MX',
    name: 'Mexico',
    flag: '🇲🇽',
    capital: 'Mexico City',
    continent: 'Americas',
    languages: ['Spanish', 'Nahuatl', 'Maya', '68 National Indigenous Languages'],
    traditionalFoods: ['Tacos al Pastor', 'Mole Poblano', 'Guacamole', 'Tamales', 'Pozole'],
    landmarks: ['Chichen Itza', 'Teotihuacan Pyramids', 'Cenotes of Yucatan', 'Palacio de Bellas Artes'],
    facts: [
      'Traditional Mexican cuisine was recognized by UNESCO as an Intangible Cultural Heritage of Humanity.',
      'Día de los Muertos (Day of the Dead) honors ancestors with vibrant marigolds, sugar skulls, and ofrendas.',
      'Mexico introduced chocolate, corn, vanilla, and chili peppers to the wider world.',
      'Mexico City is built upon the ancient Aztec capital of Tenochtitlan.'
    ],
    badgeTitle: 'Aztec Luminary',
    population: '129 Million',
    mapCoords: { x: 20, y: 44 }
  },
  {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    capital: 'Washington, D.C.',
    continent: 'Americas',
    languages: ['English', 'Spanish'],
    traditionalFoods: ['Southern Barbecue', 'Clam Chowder', 'Apple Pie', 'Buffalo Wings'],
    landmarks: ['Grand Canyon', 'Statue of Liberty', 'Yellowstone National Park', 'Golden Gate Bridge'],
    facts: [
      'Yellowstone was established in 1872 as the world’s first national park.',
      'The US has diverse ecosystems ranging from Arctic tundra in Alaska to tropical rainforests in Hawaii.',
      'Jazz, Blues, and Rock and Roll all originated in the United States.',
      'The country spans four time zones across the contiguous 48 states.'
    ],
    badgeTitle: 'Coast-to-Coast Navigator',
    population: '335 Million',
    mapCoords: { x: 22, y: 36 }
  },
  {
    code: 'MA',
    name: 'Morocco',
    flag: '🇲🇦',
    capital: 'Rabat',
    continent: 'Africa',
    languages: ['Arabic', 'Amazigh', 'Moroccan Darija', 'French'],
    traditionalFoods: ['Tagine', 'Couscous', 'Pastilla', 'Mint Tea'],
    landmarks: ['Medina of Fez', 'Jemaa el-Fnaa in Marrakech', 'Chefchaouen (Blue City)', 'Hassan II Mosque'],
    facts: [
      'The University of al-Qarawiyyin in Fez, founded in 859 AD, is recognized by UNESCO as the oldest continuously operating university.',
      'Chefchaouen is famed worldwide for its labyrinth of dazzling blue-painted alleys in the Rif mountains.',
      'Moroccan mint tea, affectionately nicknamed "Berber whiskey", is a symbol of friendship and welcome.',
      'Morocco borders both the Atlantic Ocean and the Mediterranean Sea.'
    ],
    badgeTitle: 'Atlas Adventurer',
    population: '37 Million',
    mapCoords: { x: 47, y: 39 }
  },
  {
    code: 'DE',
    name: 'Germany',
    flag: '🇩🇪',
    capital: 'Berlin',
    continent: 'Europe',
    languages: ['German'],
    traditionalFoods: ['Bratwurst & Sauerkraut', 'Pretzels (Brezel)', 'Sauerbraten', 'Black Forest Cake'],
    landmarks: ['Brandenburg Gate', 'Neuschwanstein Castle', 'Cologne Cathedral', 'Black Forest'],
    facts: [
      'Germany has over 20,000 castles scattered throughout its picturesque landscapes.',
      'The printing press with movable metal type was invented by Johannes Gutenberg in Mainz around 1440.',
      'Germany pioneered classical music through masters like Beethoven, Bach, and Brahms.',
      'The Autobahn network includes sections without statutory numerical speed limits.'
    ],
    badgeTitle: 'Rhine Wanderer',
    population: '84 Million',
    mapCoords: { x: 50, y: 30 }
  },
  {
    code: 'ES',
    name: 'Spain',
    flag: '🇪🇸',
    capital: 'Madrid',
    continent: 'Europe',
    languages: ['Spanish (Castilian)', 'Catalan', 'Galician', 'Basque'],
    traditionalFoods: ['Paella Valenciana', 'Jamón Ibérico', 'Gazpacho', 'Churros con Chocolate', 'Tapas'],
    landmarks: ['Sagrada Família', 'Alhambra of Granada', 'Park Güell', 'Plaza Mayor Madrid'],
    facts: [
      'Antoni Gaudí’s architectural masterwork, the Sagrada Família in Barcelona, has been under construction since 1882.',
      'Flamenco is a passionate art form originating in Andalusia combining singing (cante), guitar, and dance.',
      'Spain produces nearly half of the entire world’s olive oil.',
      'The tradition of "Sobremesa" is lingering at the table after a meal for lively conversation.'
    ],
    badgeTitle: 'Iberian Voyager',
    population: '48 Million',
    mapCoords: { x: 46, y: 36 }
  },
  {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    capital: 'New Delhi',
    continent: 'Asia',
    languages: ['Hindi', 'English', '22 Scheduled Languages'],
    traditionalFoods: ['Biryani', 'Butter Chicken', 'Masala Dosa', 'Samosas', 'Gulab Jamun'],
    landmarks: ['Taj Mahal', 'Varanasi Ghats', 'Hawa Mahal (Jaipur)', 'Kerala Backwaters'],
    facts: [
      'The Taj Mahal in Agra was built by Mughal Emperor Shah Jahan as a memorial for his beloved wife Mumtaz Mahal.',
      'India is the birthplace of chess (originally called Chaturanga), yoga, and the concept of zero in mathematics.',
      'Diwali, the festival of lights, celebrates the triumph of light over darkness and good over evil.',
      'India has the largest postal network in the world, including a floating post office in Dal Lake.'
    ],
    badgeTitle: 'Monsoon Mystic',
    population: '1.43 Billion',
    mapCoords: { x: 69, y: 44 }
  },
  {
    code: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    capital: 'Canberra',
    continent: 'Oceania',
    languages: ['English', 'Indigenous Australian Languages'],
    traditionalFoods: ['Meat Pie', 'Vegemite on Toast', 'Lamingtons', 'Pavlova'],
    landmarks: ['Sydney Opera House', 'Great Barrier Reef', 'Uluru (Ayers Rock)', 'Bondi Beach'],
    facts: [
      'The Great Barrier Reef is the largest living structure on Earth, visible even from space.',
      'Aboriginal Australian culture is one of the oldest continuous surviving cultures in human history (over 65,000 years).',
      'Australia is home to unique endemic wildlife like kangaroos, koalas, wombats, and platypuses.',
      'Australia is the only country that spans an entire continent.'
    ],
    badgeTitle: 'Outback Tracker',
    population: '26 Million',
    mapCoords: { x: 88, y: 75 }
  },
  {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    capital: 'Ottawa',
    continent: 'Americas',
    languages: ['English', 'French'],
    traditionalFoods: ['Poutine', 'Maple Syrup Treats', 'Tourtière', 'Nanaimo Bars'],
    landmarks: ['Banff National Park', 'Niagara Falls', 'CN Tower', 'Old Quebec'],
    facts: [
      'Canada has the longest coastline in the world at 243,042 kilometers.',
      'Over 60% of the world’s lakes are located within Canada’s borders.',
      'Quebec produces over 70% of the entire world’s supply of pure maple syrup.',
      'Basketball was invented by Canadian physical educator James Naismith in 1891.'
    ],
    badgeTitle: 'Northern Aurora',
    population: '40 Million',
    mapCoords: { x: 23, y: 27 }
  },
  {
    code: 'AR',
    name: 'Argentina',
    flag: '🇦🇷',
    capital: 'Buenos Aires',
    continent: 'Americas',
    languages: ['Spanish'],
    traditionalFoods: ['Asado', 'Empanadas', 'Dulce de Leche', 'Alfajores', 'Mate'],
    landmarks: ['Perito Moreno Glacier', 'Iguazu Falls (Argentine side)', 'La Boca', 'Mount Aconcagua'],
    facts: [
      'Tango was born in the working-class port neighborhoods of Buenos Aires in the late 19th century.',
      'Drinking Yerba Mate is a revered communal social ritual of sharing friendship and hospitality.',
      'Mount Aconcagua in the Andes is the highest mountain outside of Asia at 6,961 meters.',
      'Argentina is famous for its passionate football heritage, giving the world Diego Maradona and Lionel Messi.'
    ],
    badgeTitle: 'Pampas Champion',
    population: '46 Million',
    mapCoords: { x: 30, y: 80 }
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    capital: 'London',
    continent: 'Europe',
    languages: ['English', 'Welsh', 'Scottish Gaelic'],
    traditionalFoods: ['Fish and Chips', 'Sunday Roast', 'Full English Breakfast', 'Afternoon Tea & Scones'],
    landmarks: ['Big Ben & Westminster', 'Stonehenge', 'Tower Bridge', 'Edinburgh Castle'],
    facts: [
      'Stonehenge on Salisbury Plain dates back to roughly 3000 to 2000 BCE.',
      'The UK is composed of four nations: England, Scotland, Wales, and Northern Ireland.',
      'The BBC (British Broadcasting Corporation) is the world’s oldest national broadcasting organization.',
      'Greenwich in London marks the Prime Meridian (0° longitude) from which Greenwich Mean Time is calculated.'
    ],
    badgeTitle: 'Crown Trailblazer',
    population: '67 Million',
    mapCoords: { x: 47, y: 28 }
  },
  {
    code: 'TR',
    name: 'Turkey',
    flag: '🇹🇷',
    capital: 'Ankara',
    continent: 'Europe',
    languages: ['Turkish'],
    traditionalFoods: ['Kebabs', 'Baklava', 'Turkish Delight (Lokum)', 'Menemen', 'Turkish Coffee'],
    landmarks: ['Hagia Sophia', 'Cappadocia Fairy Chimneys', 'Pamukkale Travertines', 'Blue Mosque'],
    facts: [
      'Istanbul is the only transcontinental metropolis in the world, straddling both Europe and Asia across the Bosphorus Strait.',
      'Cappadocia is famous for hot air ballooning over otherworldly geological volcanic formations.',
      'Turkish coffee culture is designated as UNESCO Intangible Cultural Heritage for its ritual and hospitality.',
      'The Grand Bazaar in Istanbul is one of the largest and oldest covered shopping markets in existence.'
    ],
    badgeTitle: 'Bosphorus Bridge',
    population: '85 Million',
    mapCoords: { x: 57, y: 36 }
  },
  {
    code: 'NG',
    name: 'Nigeria',
    flag: '🇳🇬',
    capital: 'Abuja',
    continent: 'Africa',
    languages: ['English', 'Hausa', 'Yoruba', 'Igbo', 'Nigerian Pidgin'],
    traditionalFoods: ['Jollof Rice', 'Pounded Yam & Egusi Soup', 'Suya', 'Akara'],
    landmarks: ['Zuma Rock', 'Olumo Rock', 'Lekki Conservation Centre', 'Yankari National Park'],
    facts: [
      'Nigeria is the most populous country in Africa and seventh in the world.',
      'Nollywood (Nigerian film industry) is one of the largest film producers globally in volume of releases.',
      'Afrobeats music originating in Nigeria has become a dominant global music phenomenon (Burna Boy, Wizkid).',
      'The Great Wall of Benin was once one of the largest human-made earthworks on Earth.'
    ],
    badgeTitle: 'Naija Luminary',
    population: '220 Million',
    mapCoords: { x: 49, y: 49 }
  },
  {
    code: 'KE',
    name: 'Kenya',
    flag: '🇰🇪',
    capital: 'Nairobi',
    continent: 'Africa',
    languages: ['Swahili', 'English', 'Kikuyu', 'Luo', 'Maasai'],
    traditionalFoods: ['Ugali & Sukuma Wiki', 'Nyama Choma', 'Mandazi', 'Githeri'],
    landmarks: ['Maasai Mara Reserve', 'Mount Kenya', 'Lake Nakuru', 'Fort Jesus (Mombasa)'],
    facts: [
      'The Great Wildebeest Migration across the Maasai Mara and Serengeti is hailed as the "Eighth Wonder of the World".',
      'Kenya pioneered mobile money revolution with M-Pesa, reshaping digital payments globally.',
      'Kenya produces some of the greatest distance runners and Olympic marathon champions in history.',
      'Nairobi is the only global capital city in the world that features a national wildlife park bordering its city skyline.'
    ],
    badgeTitle: 'Savanna Scout',
    population: '54 Million',
    mapCoords: { x: 57, y: 55 }
  },
  {
    code: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    capital: 'Bogotá',
    continent: 'Americas',
    languages: ['Spanish'],
    traditionalFoods: ['Bandeja Paisa', 'Ajiaco', 'Arepas', 'Sancocho'],
    landmarks: ['Cartagena Walled City', 'Cocora Valley Wax Palms', 'Caño Cristales (Rainbow River)', 'Monserrate'],
    facts: [
      'Colombia is the second most biodiverse country on Earth and home to the highest variety of bird and orchid species.',
      'The Quindío wax palm in the Cocora Valley is the tallest palm tree species in the world, growing up to 60 meters.',
      'Colombia is renowned worldwide for producing top-grade, hand-picked Arabica coffee.',
      'Gabriel García Márquez won the Nobel Prize in Literature for his masterpiece One Hundred Years of Solitude.'
    ],
    badgeTitle: 'Andean Maestro',
    population: '52 Million',
    mapCoords: { x: 27, y: 54 }
  },
  {
    code: 'GR',
    name: 'Greece',
    flag: '🇬🇷',
    capital: 'Athens',
    continent: 'Europe',
    languages: ['Greek'],
    traditionalFoods: ['Moussaka', 'Greek Salad with Feta', 'Souvlaki', 'Spanakopita', 'Baklava'],
    landmarks: ['Acropolis & Parthenon', 'Santorini Caldera', 'Meteora Monasteries', 'Delphi Sanctuary'],
    facts: [
      'Greece is celebrated as the cradle of Western civilization, philosophy, drama, and democracy.',
      'The ancient Olympic Games were held in Olympia starting in 776 BCE.',
      'Greece features an archipelago of roughly 6,000 islands and islets scattered across the Aegean and Ionian seas.',
      'No point in Greece is further than 137 kilometers from the sea.'
    ],
    badgeTitle: 'Olympian Scholar',
    population: '10.4 Million',
    mapCoords: { x: 54, y: 37 }
  },
  {
    code: 'TH',
    name: 'Thailand',
    flag: '🇹🇭',
    capital: 'Bangkok',
    continent: 'Asia',
    languages: ['Thai'],
    traditionalFoods: ['Pad Thai', 'Tom Yum Goong', 'Green Curry (Gaeng Keow Wan)', 'Mango Sticky Rice'],
    landmarks: ['Grand Palace (Bangkok)', 'Wat Arun (Temple of Dawn)', 'Phi Phi Islands', 'Ayutthaya Ruins'],
    facts: [
      'Thailand is known affectionately as the "Land of Smiles" due to its warm, welcoming culture.',
      'Songkran is the Thai New Year celebration celebrated with joyful nationwide water fights symbolizing cleansing.',
      'Muay Thai (the art of eight limbs) is Thailand’s traditional martial art utilizing punches, kicks, knees, and elbows.',
      'Thailand is the only Southeast Asian nation never colonized by European powers.'
    ],
    badgeTitle: 'Siam Sentinel',
    population: '71 Million',
    mapCoords: { x: 76, y: 48 }
  },
  {
    code: 'NO',
    name: 'Norway',
    flag: '🇳🇴',
    capital: 'Oslo',
    continent: 'Europe',
    languages: ['Norwegian (Bokmål & Nynorsk)', 'Sámi'],
    traditionalFoods: ['Fårikål (Lamb and Cabbage)', 'Smoked Salmon (Røkelaks)', 'Krumkake', 'Brunost (Brown Cheese)'],
    landmarks: ['Geirangerfjord', 'Preikestolen (Pulpit Rock)', 'Lofoten Islands', 'Bryggen in Bergen'],
    facts: [
      'Norway’s coast is indented with thousands of dramatic glacial fjords carved over millions of years.',
      'The Svalbard Global Seed Vault protects backup seeds of the world’s crops deep inside Arctic permafrost.',
      'During summer months above the Arctic Circle, the sun never sets—a phenomenon known as the Midnight Sun.',
      'The Norwegian concept of "Friluftsliv" celebrates an outdoor life connected with untamed nature.'
    ],
    badgeTitle: 'Fjord Pathfinder',
    population: '5.5 Million',
    mapCoords: { x: 50, y: 22 }
  },
  {
    code: 'PE',
    name: 'Peru',
    flag: '🇵🇪',
    capital: 'Lima',
    continent: 'Americas',
    languages: ['Spanish', 'Quechua', 'Aymara'],
    traditionalFoods: ['Ceviche', 'Lomo Saltado', 'Causa Rellena', 'Papa a la Huancaína'],
    landmarks: ['Machu Picchu', 'Nazca Lines', 'Rainbow Mountain (Vinicunca)', 'Lake Titicaca'],
    facts: [
      'Machu Picchu, the 15th-century Inca citadel perched in the cloud forest, is a UNESCO World Heritage Site.',
      'Peru is the birthplace of the potato, cultivating over 4,000 native varieties.',
      'Lake Titicaca is the highest navigable body of water in the world at 3,812 meters above sea level.',
      'The mysterious Nazca Lines feature massive geoglyphs etched into the desert sands visible from above.'
    ],
    badgeTitle: 'Inca Custodian',
    population: '34 Million',
    mapCoords: { x: 26, y: 62 }
  }
];

export const COUNTRIES_MAP = new Map<string, CountryData>(
  COUNTRIES.map((c) => [c.code, c])
);

export function getCountryByCode(code: string): CountryData | undefined {
  return COUNTRIES_MAP.get(code.toUpperCase());
}

export function getRandomCountry(): CountryData {
  return COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
}
