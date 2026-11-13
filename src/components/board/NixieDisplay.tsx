// Material reference: Rafa's Nixie Tube Clock, https://codepen.io/RAFA3L/pen/PoVYoPN.
// Rounded wire cathodes keep the tube readable without an external display font.
const cathodes = [
  "M20 9C9 9 9 18 9 32S9 55 20 55S31 46 31 32S31 9 20 9Z",
  "M12 18L21 9V55M12 55H30",
  "M9 19C9 6 31 6 31 19C31 29 9 36 9 51V55H31",
  "M9 14C17 5 31 8 31 20C31 29 24 32 17 32M17 32C25 32 31 35 31 44C31 56 16 59 9 50",
  "M27 55V9L8 39H33",
  "M31 9H11L9 31C18 25 31 29 31 42C31 57 16 59 9 50",
  "M29 12C14 2 9 17 9 35V43C9 59 31 59 31 43C31 28 10 27 9 39",
  "M8 9H32L15 55",
  "M20 9C5 9 7 29 20 32C34 35 36 55 20 55C4 55 6 35 20 32C33 29 35 9 20 9Z",
  "M31 25C31 9 9 4 9 22C9 38 30 38 31 25V38C31 54 25 59 12 52",
];

export function NixieDisplay({ text }: { text: string }) {
  return (
    <span className="nixie-display" aria-hidden="true">
      {Array.from(text, (character, index) =>
        character === ":" ? (
          <span className="nixie-separator" key={index}>
            <i />
            <i />
          </span>
        ) : (
          <span className="nixie-tube" key={index}>
            <span className="nixie-envelope">
              <svg
                className="nixie-cathodes"
                viewBox="0 0 40 64"
                focusable="false"
              >
                {cathodes.map((path, digit) => (
                  <path className="nixie-wire" d={path} key={digit} />
                ))}
                <path
                  className="nixie-digit"
                  d={cathodes[Number(character)]}
                  key={character}
                />
              </svg>
            </span>
          </span>
        ),
      )}
    </span>
  );
}
