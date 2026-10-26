
export default async function handler(req, res) {
  // Allow requests from your GitHub Pages website.
  const allowedOrigin = "https://cuhdyy.github.io";

  const origin = req.headers.origin;

  if (origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Browsers send this before cross-origin POST requests.
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({
      error: "Use POST to clean a photo."
    });
  }

  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "FAL_KEY is missing from Vercel Environment Variables."
    });
  }

  try {
    const { imageData, maskData } = req.body || {};

    const validImage = (value) =>
      typeof value === "string" &&
      /^data:image\/(png|jpeg|webp);base64,/i.test(value);

    if (!validImage(imageData) || !validImage(maskData)) {
      return res.status(400).json({
        error: "The photo or selection mask is invalid."
      });
    }

    // Keep the request within Vercel's request-size limits.
    if (imageData.length + maskData.length > 3900000) {
      return res.status(413).json({
        error: "Image too large. Try a smaller photo."
      });
    }

    const aiResponse = await fetch(
      "https://fal.run/fal-ai/object-removal/mask",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          image_url: imageData,
          mask_url: maskData,
          model: "best_quality",
          mask_expansion: 15
        })
      }
    );

    const aiResult = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error(
        "fal.ai error:",
        aiResponse.status,
        JSON.stringify(aiResult).slice(0, 1000)
      );

      return res.status(502).json({
        error: "fal.ai rejected the request. Check your fal.ai account, credits, and API access."
      });
    }

    const resultUrl = aiResult.images?.[0]?.url;

    if (!resultUrl) {
      console.error("fal.ai returned no image URL.");

      return res.status(502).json({
        error: "The AI did not return a cleaned image."
      });
    }

    const imageResponse = await fetch(resultUrl);

    if (!imageResponse.ok) {
      return res.status(502).json({
        error: "Could not retrieve the cleaned image."
      });
    }

    const contentType =
      imageResponse.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
      return res.status(502).json({
        error: "The AI returned an unexpected file type."
      });
    }

    const bytes = Buffer.from(await imageResponse.arrayBuffer());

    if (bytes.length > 3900000) {
      return res.status(502).json({
        error: "The cleaned image is too large. Try a smaller photo."
      });
    }

    return res.status(200).json({
      imageData:
        `data:${contentType};base64,${bytes.toString("base64")}`
    });

  } catch (error) {
    console.error("PhotoCuh API error:", error.message);

    return res.status(500).json({
      error: "AI cleaning failed. Please try again."
    });
  }
}
