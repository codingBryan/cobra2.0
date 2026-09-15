import { getToken } from "next-auth/jwt";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch"; // Required for the Graph client

export default async function handler(req, res) {
  const token = await getToken({ req });

  if (!token || !token.accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const client = Client.init({
      authProvider: (done) => {
        done(null, token.accessToken);
      },
    });

    const driveItems = await client.api("/me/drive/root/children").get();
    
    res.status(200).json(driveItems.value);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}