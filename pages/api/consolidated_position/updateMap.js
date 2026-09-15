import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const newMap = req.body;

    // Find the absolute path to the config file
    const filePath = path.resolve('./consolidated_position/config', 'consolidationMap.json');
    
    // Write the new map to the file, formatted nicely
    fs.writeFileSync(filePath, JSON.stringify(newMap, null, 2));

    res.status(200).json({ message: 'Map updated successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to update map.' });
  }
}