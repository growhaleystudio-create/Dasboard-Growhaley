const imgIconLeadingSwap = "http://localhost:3845/assets/3fb65bb8d9ad4ce639daca6f2ccc677460b793d6.svg";
const imgTagCloseButton = "http://localhost:3845/assets/de91d48cf43c4220fcb21bf468bd22c07cb56999.svg";
const imgIconLeadingSwap1 = "http://localhost:3845/assets/f7f5a2b3687f9ab68edfb7a6c80719dee4168e56.svg";
const imgVector = "http://localhost:3845/assets/9905348a6a5b7cb2ebda36f05ef6908019a3bfa4.svg";
const imgVector1 = "http://localhost:3845/assets/63067f46596772a32f50f87f87248b36bd897e22.svg";
const imgVector2 = "http://localhost:3845/assets/0c0104634ec308d604711ddf5761207e899189cb.svg";
type TagProps = {
  className?: string;
  close?: boolean;
  color?: "Red" | "Blue";
  count?: boolean;
  iconLeading?: boolean;
  iconTrailing?: boolean;
  size?: "xSmall" | "Medium";
  style?: "Solid" | "Light";
  tagText?: string;
};

function Tag({ className, close = false, color = "Red", count = false, iconLeading = false, iconTrailing = false, size = "xSmall", style = "Solid", tagText = "Tag here" }: TagProps) {
  const isLightAndBlueAndMedium = style === "Light" && color === "Blue" && size === "Medium";
  const isSolidAndRedAndXSmall = style === "Solid" && color === "Red" && size === "xSmall";
  return (
    <div className={className || `${String.raw`content-stretch flex items-center overflow-clip py-[2px] relative rounded-[var(--corner-full,224px)] `}${isLightAndBlueAndMedium ? String.raw`bg-[var(--utility-blue-background,#e5f2ff)] min-h-[24px]` : String.raw`bg-[var(--utility-red-color,#ff3b30)] min-h-[20px]`}`} id={isLightAndBlueAndMedium ? "node-14416_236245" : "node-14416_235327"}>
      <div className={`content-stretch flex items-center relative rounded-[24px] shrink-0 ${isLightAndBlueAndMedium ? "h-[20px]" : "h-[16px]"}`} id={isLightAndBlueAndMedium ? "node-14416_236246" : "node-14416_235328"} data-name="Tag content">
        <div className="flex flex-row items-center self-stretch">
          <div className="content-stretch flex gap-[var(--gap-and-padding\/xsmall,4px)] h-full items-center px-[var(--gap-and-padding\/xsmall,4px)] relative shrink-0" id={isLightAndBlueAndMedium ? "node-14416_236247" : "node-14416_235329"} data-name="Label">
            {isSolidAndRedAndXSmall && iconLeading && (
              <div className="content-stretch flex items-start relative shrink-0" data-node-id="14416:235330" data-name="Icon Leading Swap">
                <div className="content-stretch flex items-start relative shrink-0" data-node-id="I14416:235330;926:62040" data-name="Icon">
                  <div className="overflow-clip relative shrink-0 size-[16px]" data-node-id="I14416:235330;7828:679" data-name="Style=Outlined">
                    <div className="absolute inset-[8.33%]" data-node-id="I14416:235330;7828:679;14410:63678" data-name="Vector">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIconLeadingSwap} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isSolidAndRedAndXSmall && (
              <div className="content-stretch flex gap-[var(--gap-and-padding\/xsmall,0px)] h-full items-center px-[var(--gap-and-padding\/xsmall,4px)] relative shrink-0" data-node-id="14416:235331">
                <p className="[word-break:break-word] font-[family-name:var(--font-family-inter,'Inter:Medium')] font-[var(--font-weight-medium,normal)] font-medium leading-[var(--font-line-height\/caption,16px)] relative shrink-0 text-[color:var(--label-white,white)] text-[length:var(--font-font-size\/caption,12px)] tracking-[var(--font-letter-spacing\/caption,0px)] whitespace-nowrap" data-node-id="14416:235332">
                  {tagText}
                </p>
              </div>
            )}
            {isSolidAndRedAndXSmall && count && (
              <div className="bg-[var(--utility-red-hover,#ffb1ac)] content-stretch flex flex-col h-[14px] items-center justify-center min-w-[14px] p-px relative rounded-[256px] shrink-0" data-node-id="14416:235333" data-name=".Count">
                <div className="content-stretch flex flex-col gap-[var(--gap-and-padding\/small,0px)] h-[16px] items-center justify-center relative shrink-0" data-node-id="I14416:235333;14416:237387" data-name="number">
                  <div className="[word-break:break-word] flex flex-col font-[family-name:var(--font-family-inter,'Inter:Regular')] font-[var(--font-weight-regular,normal)] font-normal justify-center leading-[0] relative shrink-0 text-[color:var(--utility-red-label,#cc2f26)] text-[length:var(--font-font-size\/caption,12px)] text-center tracking-[var(--font-letter-spacing\/caption,0px)] whitespace-nowrap" data-node-id="I14416:235333;14416:237388">
                    <p className="leading-[var(--font-line-height\/caption,16px)]">8</p>
                  </div>
                </div>
              </div>
            )}
            {isSolidAndRedAndXSmall && close && (
              <div className="bg-[var(--utility-red-background,#ffebea)] content-stretch flex flex-col items-start p-px relative rounded-[var(--corner-full,224px)] shrink-0 size-[18px]" data-node-id="14416:235334" data-name=".Tag close button">
                <div className="bg-[var(--background-transparent,rgba(255,255,255,0))] relative shrink-0 size-[16px]" data-node-id="I14416:235334;14416:235261" data-name="Close">
                  <div className="absolute inset-[20.83%]" data-node-id="I14416:235334;14416:235261;14410:59339" data-name="Vector">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgTagCloseButton} />
                  </div>
                </div>
              </div>
            )}
            {isSolidAndRedAndXSmall && iconTrailing && (
              <div className="content-stretch flex items-start relative shrink-0" data-node-id="14417:286479" data-name="Icon Leading Swap">
                <div className="content-stretch flex items-start relative shrink-0" data-node-id="I14417:286479;926:62040" data-name="Icon">
                  <div className="overflow-clip relative shrink-0 size-[16px]" data-node-id="I14417:286479;7828:679" data-name="Style=Outlined">
                    <div className="absolute inset-[29.17%_8.33%]" data-node-id="I14417:286479;7828:679;14410:72690" data-name="Vector">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIconLeadingSwap1} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isLightAndBlueAndMedium && iconLeading && (
              <div className="content-stretch flex items-start relative shrink-0" data-node-id="14416:236248" data-name="Icon Leading Swap">
                <div className="content-stretch flex items-start relative shrink-0" data-node-id="I14416:236248;926:62043" data-name="Icon">
                  <div className="overflow-clip relative shrink-0 size-[20px]" data-node-id="I14416:236248;7828:683" data-name="Style=Outlined">
                    <div className="absolute inset-[8.33%]" data-node-id="I14416:236248;7828:683;14410:63678" data-name="Vector">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isLightAndBlueAndMedium && (
              <div className="content-stretch flex gap-[var(--gap-and-padding\/xsmall,0px)] h-full items-center px-[var(--gap-and-padding\/small,8px)] relative shrink-0" data-node-id="14416:236249">
                <p className="[word-break:break-word] font-[family-name:var(--font-family-inter,'Inter:Medium')] font-[var(--font-weight-medium,normal)] font-medium leading-[var(--font-line-height\/body-s,18px)] relative shrink-0 text-[color:var(--utility-blue-label,#004999)] text-[length:var(--font-font-size\/body-s,14px)] tracking-[var(--font-letter-spacing\/body-s,-0.1px)] whitespace-nowrap" data-node-id="14416:236250">
                  {tagText}
                </p>
              </div>
            )}
            {isLightAndBlueAndMedium && count && (
              <div className="bg-[var(--utility-blue-hover,#99caff)] content-stretch flex flex-col h-[18px] items-center justify-center min-w-[18px] p-[var(--gap-and-padding\/xsmall,4px)] relative rounded-[256px] shrink-0" data-node-id="14416:236251" data-name=".Count">
                <div className="content-stretch flex flex-col gap-[var(--gap-and-padding\/small,0px)] h-[16px] items-center justify-center relative shrink-0" data-node-id="I14416:236251;14416:237375" data-name="number">
                  <div className="[word-break:break-word] flex flex-col font-[family-name:var(--font-family-inter,'Inter:Medium')] font-[var(--font-weight-medium,normal)] font-medium justify-center leading-[0] relative shrink-0 text-[color:var(--utility-blue-label,#004999)] text-[length:var(--font-font-size\/body-s,14px)] text-center tracking-[var(--font-letter-spacing\/body-s,-0.1px)] whitespace-nowrap" data-node-id="I14416:236251;14416:237376">
                    <p className="leading-[var(--font-line-height\/body-s,18px)]">8</p>
                  </div>
                </div>
              </div>
            )}
            {isLightAndBlueAndMedium && close && (
              <div className="bg-[var(--utility-blue-hover,#99caff)] content-stretch flex flex-col items-start p-[var(--gap-and-padding\/xsmall,4px)] relative rounded-[var(--corner-full,224px)] shrink-0 size-[24px]" data-node-id="14416:236252" data-name=".Tag close button">
                <div className="bg-[var(--background-transparent,rgba(255,255,255,0))] relative shrink-0 size-[16px]" data-node-id="I14416:236252;14416:235193" data-name="Close">
                  <div className="absolute inset-[20.83%]" data-node-id="I14416:236252;14416:235193;14410:59339" data-name="Vector">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector1} />
                  </div>
                </div>
              </div>
            )}
            {isLightAndBlueAndMedium && iconTrailing && (
              <div className="content-stretch flex items-start relative shrink-0" data-node-id="14417:286549" data-name="Icon Leading Swap">
                <div className="content-stretch flex items-start relative shrink-0" data-node-id="I14417:286549;926:62043" data-name="Icon">
                  <div className="overflow-clip relative shrink-0 size-[20px]" data-node-id="I14417:286549;7828:683" data-name="Style=Outlined">
                    <div className="absolute inset-[29.17%_8.33%]" data-node-id="I14417:286549;7828:683;14410:72690" data-name="Vector">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector2} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { Tag };
