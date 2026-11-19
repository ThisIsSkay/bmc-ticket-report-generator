import {allowedSignatureImage,signatureImageSize,imageFileToDataUrl} from './signature-html.mjs';
export function validHeaderLogo(src){return allowedSignatureImage(src)&&!!signatureImageSize(src);}
export function logoDisplaySize(src){const size=signatureImageSize(src);if(!size)return null;const factor=Math.min(120/size.width,40/size.height);return {width:Math.max(1,Math.round(size.width*factor)),height:Math.max(1,Math.round(size.height*factor))};}
export function logoWarning(src){const size=logoDisplaySize(src);return size&&(size.width<40||size.height<16)?'This image is very tall or wide and will appear very small.':'';}
export const readHeaderLogo=file=>imageFileToDataUrl(file,{maxWidth:360,maxHeight:120});
/** Does not mutate the active settings; callers adopt the candidate only on success. */
export function persistCandidate(storage,key,candidate){storage.setItem(key,JSON.stringify(candidate));return candidate;}
