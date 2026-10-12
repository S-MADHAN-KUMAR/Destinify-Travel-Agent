import Image from "next/image";

type BrandLogoProps = {
  height?: number;
};

export default function BrandLogo({ height = 24 }: BrandLogoProps) {
  return (
    <Image
      src="/brand-logo.png"
      alt=""
      aria-hidden="true"
      width={201}
      height={269}
      className="w-auto shrink-0"
      style={{ height }}
    />
  );
}
