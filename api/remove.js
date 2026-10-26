
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "FAL_KEY is missing from Vercel Environment Variables."
    });
  }

  try {
    const { imageData, maskData } = req.body || {};

    if (
      typeof imageData !== "string" ||
      typeof maskData !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,/i.test(imageData) ||
      !/^data:image\/(png|jpeg|webp);base64,/i.test(maskData)
    ) {
      return res.status(400).json({
        error: "The photo or selection mask is invalid."
      });
    }

    // Keep requests small enough for Vercel's request limit.
    if (imageData.length + maskData.length > 4_000_000) {
      return res.status(413).json({
        error: "Image too large for this request. Try a smaller photo."
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
      console.error("fal.ai error:", aiResponse.status, aiResult);
      return res.status(502).json({
        error: "The AI service rejected the request. Check your fal.ai account and credits."
      });
    }

    const resultUrl = aiResult.images?.[0]?.url;
    if (!resultUrl) {
      return res.status(502).json({
        error: "The AI did not return a cleaned image."
      });
    }

    // Fetch the result server-side so the browser can display and download it.
    const imageResponse = await fetch(resultUrl);
    if (!imageResponse.ok) {
      return res.status(502).json({
        error: "The AI result could not be downloaded."
      });
    }

    const contentType = imageResponse.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(502).json({
        error: "The AI returned an unexpected file type."
      });
    }

    const bytes = Buffer.from(await imageResponse.arrayBuffer());

    if (bytes.length > 4_000_000) {
      return res.status(502).json({
        error: "The result is too large to return. Try a smaller photo."
      });
    }

    return res.status(200).json({
      imageData: `data:${contentType};base64,${bytes.toString("base64")}`
    });
  } catch (error) {
    console.error("PhotoCuh AI error:", error.message);
    return res.status(500).json({
      error: "AI cleaning failed. Please try again."
    });
  }
}
