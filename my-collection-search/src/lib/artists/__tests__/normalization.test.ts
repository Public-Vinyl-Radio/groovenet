import { describe, expect, it } from "vitest";
import { normaliseArtistName } from "../normalization";

describe("normaliseArtistName", () => {
  it.each([
    ["Mac DeMarco", "mac demarco"],
    ["Mac Demarco", "mac demarco"],
    ["Patten", "patten"],
    ["patten", "patten"],
    ["Dego & Kaidi Tatham", "dego and kaidi tatham"],
    ["Dego And Kaidi Tatham", "dego and kaidi tatham"],
    ["Pastor López Y Su Combo", "pastor lopez y su combo"],
    ["The Strokes", "strokes"],
    ["Strokes, The", "strokes"],
    ["Black Keys, The", "black keys"],
    ["The Black Keys", "black keys"],
    [
      "Loni Gamble Band, The Featuring Lisa Warrington",
      "loni gamble band featuring lisa warrington",
    ],
    ["Heptones, The / Jackie Mittoo", "heptones / jackie mittoo"],
    ["Charisma (12) Featuring Brenda Watts", "charisma featuring brenda watts"],
    ["New Order (2)", "new order"],
    ["(2) The Strokes (3)", "strokes"],
    [
      "Mexican Institute Of Sound, Meridian brothers",
      "mexican institute of sound, meridian brothers",
    ],
    [
      "Mexican Institute of Sound & Meridian Brothers",
      "mexican institute of sound and meridian brothers",
    ],
    [
      "Camilo Lara Alvarez & Eblis Javier Álvarez Vargas",
      "camilo lara alvarez and eblis javier alvarez vargas",
    ],
    ["Earth, Wind & Fire", "earth, wind and fire"],
    ["Peter, Paul & Mary", "peter, paul and mary"],
    ["Simon & Garfunkel", "simon and garfunkel"],
    ["Fela Kuti & Africa 70", "fela kuti and africa 70"],
    ["Fruko Y Sus Tesos", "fruko y sus tesos"],
    ["Artist X Another", "artist x another"],
    ["Various", "various"],
    ["Unknown Artist", "unknown artist"],
    ["Los Mirlos", "los mirlos"],
    ["Juaneco Y Su Combo", "juaneco y su combo"],
    ["Los Destellos", "los destellos"],
    ["Ritmo Babilonia feat. Beck", "ritmo babilonia feat. beck"],
    ["  A\t &  B \n", "a and b"],
    ["Beyonce\u0301", "beyonce"],
    ["The The", "the"],
    ["Theatre (Live)", "theatre (live)"],
    ["", ""],
    ["  (12) ", ""],
  ])("normalises %j without splitting credits", (input, expected) => {
    expect(normaliseArtistName(input)).toBe(expected);
  });
});
