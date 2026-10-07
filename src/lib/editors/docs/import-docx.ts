"use client";

/**
 * Convert a Word (.docx) file to HTML the editor understands. Runs in the
 * browser; embedded images are uploaded as document assets.
 * Mammoth keeps the structure (headings, lists, tables, bold/italic/underline,
 * links, images); page layout and exotic styling are not carried over.
 */
export async function docxToHtml(data: ArrayBuffer, uploadImage: (image: Blob) => Promise<string>): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Quote'] => blockquote > p:fresh",
        "p[style-name='Intense Quote'] => blockquote > p:fresh",
        "u => u",
        "strike => s",
      ],
      convertImage: mammoth.images.imgElement(async (image) => {
        const buffer = await image.readAsArrayBuffer();
        const src = await uploadImage(new Blob([buffer], { type: image.contentType }));
        return { src };
      }),
    },
  );
  return result.value;
}
