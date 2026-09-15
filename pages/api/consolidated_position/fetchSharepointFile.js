// pages/api/fetchSharepointFile.js
import { getToken } from "next-auth/jwt";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import * as xlsx from "xlsx";
import { getAppOnlyAccessToken, invalidateAppOnlyToken } from "../../../consolidated_position/lib/graphAppOnlyAuth";
import { transformKenyaData } from "../../../consolidated_position/transformers/kenyaTransformer";
import { transformEthiopiaData } from "../../../consolidated_position/transformers/ethiopiaTransformer";
import { transformRwandaData } from "../../../consolidated_position/transformers/rwandaTransformer";
import { transformTanzaniaData } from "../../../consolidated_position/transformers/tanzaniaTransformer";
import { transformUgandaData } from "../../../consolidated_position/transformers/ugandaTransformer";
import { transformBurundiData } from "../../../consolidated_position/transformers/burundiTransformer";

function base64URLEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// Fetches the driveItem metadata for a SharePoint share URL using the given
// Graph access token. Thrown errors carry an `isAuthError` flag when they
// look like a missing-permission/expired-token problem, so callers can
// decide whether it's worth falling back to a different auth mode.
async function fetchDriveItem(accessToken, shareUrl) {
  const client = Client.init({
    authProvider: (done) => done(null, accessToken),
  });

  const encodedUrl = base64URLEncode(shareUrl);
  const driveItemUrl = `/shares/u!${encodedUrl}/driveItem`;

  try {
    return await client.api(driveItemUrl).get();
  } catch (err) {
    const status = err.statusCode || err.status;
    if (status === 401 || status === 403) {
      err.isAuthError = true;
    }
    throw err;
  }
}

// Resolves a Graph access token, preferring fully-automated app-only auth
// (client credentials) and falling back to the signed-in user's delegated
// token from NextAuth when app-only isn't configured/permitted yet.
async function resolveGraphAccess(req, country) {
  // --- Attempt 1: automated app-only (client credentials) auth ---
  const appOnlyToken = await getAppOnlyAccessToken();
  if (appOnlyToken) {
    try {
      const driveItem = await fetchDriveItem(appOnlyToken, country.url);
      console.log(`[fetchSharepointFile] ${country.name}: using automated app-only auth.`);
      return { mode: "app-only", accessToken: appOnlyToken, driveItem };
    } catch (err) {
      if (err.isAuthError) {
        console.warn(
          `[fetchSharepointFile] App-only auth rejected by Graph for ${country.name} ` +
          `(app registration likely missing Application permissions / admin consent). ` +
          `Falling back to interactive sign-in flow.`
        );
        invalidateAppOnlyToken();
      } else {
        console.warn(`[fetchSharepointFile] App-only attempt failed for ${country.name}:`, err.message);
      }
      // Fall through to the delegated flow below.
    }
  }

  // --- Attempt 2: fall back to the current interactive/delegated flow ---
  const userToken = await getToken({ req });
  if (!userToken || !userToken.accessToken) {
    return null;
  }
  const driveItem = await fetchDriveItem(userToken.accessToken, country.url);
  return { mode: "delegated", accessToken: userToken.accessToken, driveItem };
}

export default async function handler(req, res) {
  const { country } = req.body;

  if (!country || !country.url || !country.config) {
    return res.status(400).json({ message: "Missing country configuration" });
  }

  try {
    const graphAccess = await resolveGraphAccess(req, country);

    if (!graphAccess) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { driveItem } = graphAccess;

    if (!driveItem || !driveItem['@microsoft.graph.downloadUrl']) {
        return res.status(404).json({ message: "Could not retrieve file download URL." });
    }

    // Now, fetch the content from the download URL
    const response = await fetch(driveItem['@microsoft.graph.downloadUrl']);
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const fileBuffer = await response.arrayBuffer();
    
    const workbook = xlsx.read(fileBuffer, { cellFormula: false });
    
    let cleanData;

    // --- MODIFICATION FOR BURUNDI ---
    if (country.name === "Burundi") {
      const recapSheet = workbook.Sheets[country.config.recapSheet];
      const scheduleSheet = workbook.Sheets[country.config.scheduleSheet];
      if (!recapSheet) {
        return res.status(404).json({ message: `Sheet '${country.config.recapSheet}' not found.` });
      }
      if (!scheduleSheet) {
        return res.status(404).json({ message: `Sheet '${country.config.scheduleSheet}' not found.` });
      }
      cleanData = transformBurundiData(recapSheet, scheduleSheet, country);
    } else {
    // --- END MODIFICATION ---

      const worksheet = workbook.Sheets[country.config.sheetName];
      if (!worksheet) {
        return res.status(404).json({ message: `Sheet '${country.config.sheetName}' not found.` });
      }
      
      switch (country.name) {
        case "Kenya":
          cleanData = transformKenyaData(worksheet, country);
          break;
        case "Ethiopia":
          cleanData = transformEthiopiaData(worksheet, country);
          break;
        case "Rwanda":
          cleanData = transformRwandaData(worksheet, country);
          break;
        case "Tanzania":
          cleanData = transformTanzaniaData(worksheet, country);
          break;
        case "Uganda":
          cleanData = transformUgandaData(worksheet, country);
          break;
        default:
          throw new Error(`No transformer available for "${country.name}"`);
      }
    }
    
    // Return data, metadata, and which auth mode actually served this request
    // ("app-only" = fully automated, "delegated" = interactive sign-in fallback).
    res.status(200).json({
      data: cleanData,
      lastModifiedDateTime: driveItem.lastModifiedDateTime,
      authMode: graphAccess.mode,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}