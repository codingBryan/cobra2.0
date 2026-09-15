// Conversion factors to 1 Metric Ton
export const CONVERSION_FACTORS_TO_MT = {
  'bags': 0.06,  // 1 bag = 60kg
  'KGs': 0.001,   // 1 kg = 0.001 MT
  'MT': 1,
};

// Helper function to perform the conversion
export function convertToMT(quantity, unit) {
  const factor = CONVERSION_FACTORS_TO_MT[unit];
  if (factor === undefined) {
    console.warn(`Warning: No conversion factor found for unit "${unit}". Returning original quantity.`);
    return quantity;
  }
  return quantity * factor;
}