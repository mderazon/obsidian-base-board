export const relativeLuminance = (colorCode: string): "dark" | "light" => {
  if (!colorCode) {
    throw new Error("Please provide a hex color code");
  }
  const hexRegex = /^#([A-Fa-f0-9]{3}){1,2}$/;
  const isValidHex = hexRegex.test(colorCode);
  if (!isValidHex) {
    throw new Error("Please provide a valid hex code");
  }
  colorCode =
    colorCode.length === 4
      ? colorCode.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3")
      : colorCode;
  const hex = colorCode.substring(1);
  const [red, green, blue] = [0, 2, 4].map((startIndex) =>
    Number.parseInt(hex.substring(startIndex, startIndex + 2), 16),
  );
  const lum = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return lum < 0.7 ? "dark" : "light";
};
