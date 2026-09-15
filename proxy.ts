import { NextResponse, type NextRequest } from "next/server";
import { salesPreviewAllows, salesReadOnlyPreview } from "./lib/sales-preview";
export function proxy(request:NextRequest) {
  if(salesReadOnlyPreview()&&!salesPreviewAllows(request.nextUrl.pathname,request.method))
    return NextResponse.json({error:"This sales preview is read-only. Use the live workspace to make changes."},{status:403,headers:{"Cache-Control":"no-store"}});
  return NextResponse.next();
}
export const config={matcher:"/api/:path*"};
