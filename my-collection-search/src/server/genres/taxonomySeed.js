/**
 * Discogs-derived labels used by the Essentia Discogs-4M classifier, plus
 * every additional Discogs style presently imported in production.
 *
 * A genre may have several valid musical lineages, but Groovenet v1 uses one
 * navigation parent. The explicit choices below are product decisions for
 * browsing, not assertions that the other Discogs association is invalid.
 */

export const genreSeed = [
  {
    "name": "Blues",
    "source": "discogs"
  },
  {
    "name": "Brass & Military",
    "source": "discogs"
  },
  {
    "name": "Children's",
    "source": "discogs"
  },
  {
    "name": "Classical",
    "source": "discogs"
  },
  {
    "name": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Latin",
    "source": "discogs"
  },
  {
    "name": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Pop",
    "source": "discogs"
  },
  {
    "name": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Rock",
    "source": "discogs"
  },
  {
    "name": "Stage & Screen",
    "source": "discogs"
  }
];

export const genreStyleSeed = [
  {
    "name": "Abstract",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Acid",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Acid House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Acid Jazz",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Acid Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Acoustic",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "African",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Afro-Cuban",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Afro-Cuban Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Afrobeat",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Aguinaldo",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Alt-Pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Alternative Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Ambient",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Andean Music",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "AOR",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Arena Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Art Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Atmospheric Black Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Audiobook",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Avant-garde Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Avantgarde",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Bachata",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Baião",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Balearic",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Ballad",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Baroque",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Baroque Pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Bass Music",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Bassline",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Batucada",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Bayou Funk",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Beat",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Beatdown",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Beguine",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Berlin-School",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Big Band",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Big Beat",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Bitpop",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Black Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Bleep",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Bluegrass",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Blues Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Bolero",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Bollywood",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Bomba",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Boogaloo",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Boogie",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Boogie Woogie",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Boom Bap",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Bop",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Bossa Nova",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Bossanova",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Bounce",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Brass Band",
    "parentName": "Brass & Military",
    "source": "discogs"
  },
  {
    "name": "Breakbeat",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Breakcore",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Breaks",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Brit Pop",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Britcore",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Broken Beat",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Bubblegum",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Cajun",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Calypso",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Canzone Napoletana",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Catalan Music",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Celtic",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Cha-Cha",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Chamamé",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Champeta",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Chanson",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Charanga",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Chicago Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Chillwave",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Chiptune",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Choral",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "City Pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Classic Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Cloud Rap",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Coldwave",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Comedy",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Compas",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Conscious",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Contemporary",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Contemporary Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Contemporary R&B",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Cool Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Corrido",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Country",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Country Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Country Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Crunk",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Crust",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Cubano",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Cumbia",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Currulao",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Cut-up/DJ",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Dance-pop",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Dancehall",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Dangdut",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Danzon",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Dark Ambient",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Darkwave",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Death Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Deathcore",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Deathrock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Deep House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Deep Techno",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Delta Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Depressive Black Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Descarga",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Desert Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Dialogue",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Disco",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Disco Polo",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Dixieland",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "DJ Battle Tool",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Donk",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Doo Wop",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Doom Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Downtempo",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Dream Pop",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Drone",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Drum n Bass",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Dub",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Dub Techno",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Dubstep",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Dungeon Synth",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Easy Listening",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "EBM",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Education",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Educational",
    "parentName": "Children's",
    "source": "discogs"
  },
  {
    "name": "Electric Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Electro",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Electro House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Electroclash",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Emo",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Ethereal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Euro House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Euro-Disco",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Eurobeat",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Eurodance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Europop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Experimental",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Fado",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Field Recording",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Flamenco",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Folk",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Folk Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Folk Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Forró",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Free Funk",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Free Improvisation",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Free Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Freestyle",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "French House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Funaná",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Funeral Doom Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Funk",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Funk Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Fusion",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Future Jazz",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "G-Funk",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Gabber",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Gaita",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Gangsta",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Garage House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Garage Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Ghetto",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Ghetto House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Glam",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Glitch",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Go-Go",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Goa Trance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Goregrind",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Gospel",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Goth Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Gothic Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Grime",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Grindcore",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Grunge",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Guaguancó",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Guajira",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Guaracha",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Gypsy Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Halftime",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Hands Up",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Happy Hardcore",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Hard Bop",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Hard House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Hard Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Hard Techno",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Hard Trance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Hardcore",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Hardcore Hip-Hop",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Hardstyle",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Harmonica Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Hawaiian",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Health-Fitness",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Heavy Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Hi NRG",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Highlife",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Hillbilly",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Hindustani",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Hip-House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Honky Tonk",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Horrorcore",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Hypnagogic pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "IDM",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Illbient",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Impressionist",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Indian Classical",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Indie Pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Indie Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Indo-Pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Industrial",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Instrumental",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Interview",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Italo House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Italo-Disco",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Italodance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "J-pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Jangle Pop",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Jazz-Funk",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Jazz-Rock",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Jazzdance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Jazzy Hip-Hop",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Jibaro",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Juke",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Jump Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Jumpstyle",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Jungle",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "K-pop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Kayōkyoku",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Keroncong",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Krautrock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Kwaito",
    "parentName": "Electronic",
    "source": "discogs"
  },
  // Cross-branch style: Jazz is the primary navigation parent rather than Latin.
  {
    "name": "Latin Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Latin Pop",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Laïkó",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Leftfield",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Light Music",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Lo-Fi",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Louisiana Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Lounge",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Lovers Rock",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Makina",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Mambo",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Mandopop",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Marches",
    "parentName": "Brass & Military",
    "source": "discogs"
  },
  {
    "name": "Mariachi",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Math Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Medieval",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Melodic Death Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Melodic Hardcore",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Merengue",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Metalcore",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Miami Bass",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Military",
    "parentName": "Brass & Military",
    "source": "discogs"
  },
  {
    "name": "Minimal",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Minimal Techno",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Minneapolis Sound",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Mod",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Modal",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Modern",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Modern Classical",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Modern Electric Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Monolog",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Moombahton",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "MPB",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Music Hall",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Musical",
    "parentName": "Stage & Screen",
    "source": "discogs"
  },
  {
    "name": "Musique Concrète",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Neo Soul",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Neo-Classical",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Neo-Romantic",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Neofolk",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "New Age",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "New Beat",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "New Jack Swing",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "New Wave",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "No Wave",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Noise",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Noise Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Noisecore",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Nordic",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Norteño",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Novelty",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Nu Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Nu-Disco",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Nueva Cancion",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Nursery Rhymes",
    "parentName": "Children's",
    "source": "discogs"
  },
  {
    "name": "Oi",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Opera",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "P.Funk",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Pachanga",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Pacific",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Parody",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Piano Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Plena",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Poetry",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Political",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Polka",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Pop Punk",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Pop Rap",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Pop Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Pornogrind",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Porro",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Post Bop",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Post Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Post-Hardcore",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Post-Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Post-Modern",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Post-Punk",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Power Electronics",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Power Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Power Pop",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Power Violence",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Prog Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Progressive Breaks",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Progressive House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Progressive Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Progressive Trance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Promotional",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Psy-Trance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Psychedelic",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Psychedelic Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Psychobilly",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Pub Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Punk",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Radioplay",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Ragga",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Ragga HipHop",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Ragtime",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Ranchera",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Raï",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Reggae-Pop",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Reggaeton",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Religious",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Renaissance",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Rhythm & Blues",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Rhythmic Noise",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "RnB/Swing",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Rock & Roll",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Rockabilly",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Rocksteady",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Romani",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Romantic",
    "parentName": "Classical",
    "source": "discogs"
  },
  {
    "name": "Roots Reggae",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Rumba",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Salsa",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Samba",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Schlager",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Schranz",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Score",
    "parentName": "Stage & Screen",
    "source": "discogs"
  },
  {
    "name": "Screw",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Shoegaze",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Ska",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Sludge Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Smooth Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Soca",
    "parentName": "Reggae",
    "source": "discogs"
  },
  {
    "name": "Soft Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Son",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Son Montuno",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Soukous",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Soul",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Soul-Jazz",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Sound Collage",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Soundtrack",
    "parentName": "Stage & Screen",
    "source": "discogs"
  },
  {
    "name": "Southern Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Space Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Space-Age",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Special Effects",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Speech",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Speed Garage",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Speed Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Speedcore",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Spirituals",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Spoken Word",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Stoner Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Story",
    "parentName": "Children's",
    "source": "discogs"
  },
  {
    "name": "Surf",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Swing",
    "parentName": "Jazz",
    "source": "discogs"
  },
  {
    "name": "Swingbeat",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Symphonic Rock",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Synth-pop",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Synthwave",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Séga",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Tango",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Tech House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Tech Trance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Technical Death Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Techno",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Tejano",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Texas Blues",
    "parentName": "Blues",
    "source": "discogs"
  },
  {
    "name": "Theme",
    "parentName": "Stage & Screen",
    "source": "discogs"
  },
  {
    "name": "Therapy",
    "parentName": "Non-Music",
    "source": "discogs"
  },
  {
    "name": "Thrash",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Thug Rap",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Trance",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Trap",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Tribal",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Tribal House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Trip Hop",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Tropical House",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Turntablism",
    "parentName": "Hip Hop",
    "source": "discogs"
  },
  {
    "name": "Twist",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "UK Garage",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "UK Street Soul",
    "parentName": "Funk / Soul",
    "source": "discogs"
  },
  {
    "name": "Vallenato",
    "parentName": "Latin",
    "source": "discogs"
  },
  {
    "name": "Vaporwave",
    "parentName": "Electronic",
    "source": "discogs"
  },
  {
    "name": "Viking Metal",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Vocal",
    "parentName": "Pop",
    "source": "discogs"
  },
  {
    "name": "Volksmusik",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Yé-Yé",
    "parentName": "Rock",
    "source": "discogs"
  },
  {
    "name": "Zouk",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Éntekhno",
    "parentName": "Folk, World, & Country",
    "source": "discogs"
  },
  {
    "name": "Psychedelic Cumbia",
    "parentName": "Latin",
    "source": "custom"
  },
  {
    "name": "Cumbia Colombiana",
    "parentName": "Latin",
    "source": "custom"
  },
  {
    "name": "Chicha",
    "parentName": "Latin",
    "source": "custom"
  }
];

export const genreAliasSeed = [
  {
    "alias": "Bossanova",
    "genreName": "Bossa Nova",
    "source": "seed"
  }
];
