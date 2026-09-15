// config/gradeMappings.js
// This file maps different names for the same coffee grade to a single, standard name.
// Format: "Name found in the sheet": "Standard Name to use"
export const rwandaGradeMap = {
  // **NEW**: Standardize Triage names within the Rwanda file
  "W.Tri": "Triage",
  "Triage": "Triage",
  "Rw.Grinder": "Grinder",
  "Grinder": "Grinder",

  // Example: If shorts table has "AA", but longs table has "AA TOP", we map it.
  "AA": "AA TOP",
};

// A helper function our transformer will use to apply the mapping.
export function normalizeRwandaGrade(grade) {
  const gradeStr = String(grade).trim();
  return rwandaGradeMap[gradeStr] || gradeStr;
}
// **NEW**: Add a new map and helper for Uganda
export const ugandaGradeMap = {
  // Add rules here to standardize names within the Uganda file
  // For example, if the purchases table has "DRUGAR HG" and the shorts has "DRUGAR"
  "DRUGAR HG": "DRUGAR",
  // Add more as needed
};

export function normalizeUgandaGrade(grade) {
  const gradeStr = String(grade).trim();
  return ugandaGradeMap[gradeStr] || gradeStr;
}

// This file maps different names for the same coffee grade to a single, standard name.
export const burundiGradeMap = {
  // --- Mappings from Recap Sheet (Standard Names) ---
  "Specialty Fully Washed": "Specialty Fully Washed",
  "Specialty Honey": "Specialty Honey",
  "Specialty Natural": "Specialty Natural",
  "Specialty Yeast (FW & Natural)": "Specialty Yeast (FW & Natural)",
  "Specialty Lactic": "Specialty Lactic",
  "Turaco Fully Washed": "Turaco Fully Washed",
  "Inyambo Fully Washed": "Inyambo Fully Washed",
  "Low Grinders/Stocklot-T": "TT/T/Stocklot-T Fully Washed",
  "Stocklot-M Fully Washed": "Stocklot-M Fully Washed",

  // --- Mappings from Schedule Sheet ---
  "FW C2": "Inyambo Fully Washed",
  "FW C1": "Turaco Fully Washed",
  "FW S": "Specialty Fully Washed",
  "Y": "Specialty Yeast (FW & Natural)",
  "HO": "Specialty Honey",
  "NA": "Specialty Natural",
  "FW TT": "Low Grinders/Stocklot-T Fully Washed",
  "FW T": "Low Grinders/Stocklot-T Fully Washed",
  "FW STL T": "Low Grinders/Stocklot-T Fully Washed",
  "FW STL M": "Stocklot-M Fully Washed",
};

export function normalizeBurundiGrade(grade) {
  const gradeStr = String(grade).trim();
  return burundiGradeMap[gradeStr] || gradeStr;
}