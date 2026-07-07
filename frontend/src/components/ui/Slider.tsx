const imgKnob = "http://localhost:3845/assets/671aa01957c386ea1e617f076a001f6c110dc308.svg";
const imgKnob1 = "http://localhost:3845/assets/d08023bce154837d810a6134108d4677f1197224.svg";
const imgKnob2 = "http://localhost:3845/assets/7012dc895ea13a375b9c79449f4fb7ccd46b8522.svg";
type SliderProps = {
  className?: string;
  size?: "Small 16" | "Large 24" | "Medium 18";
  style?: "Accent" | "Primary" | "Inverse";
  value?: "100%" | "0%" | "10%" | "20%" | "30%" | "40%" | "50%" | "60%" | "70%" | "80%" | "90%";
};

export function Slider({ className, size = "Large 24", style = "Accent", value = "0%" }: SliderProps) {
  if (style === "Accent" && size === "Medium 18" && value === "0%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233489" data-name="Style=Accent, Size=Medium 18, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233490" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[96.4%] top-1/2" data-node-id="14416:233491" data-name="Fill">
          <div className="flex items-center justify-center max-w-[18px] min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233492" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65129" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "0%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233494" data-name="Style=Primary, Size=Medium 18, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233495" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[96.4%] top-1/2" data-node-id="14416:233496" data-name="Fill">
          <div className="flex items-center justify-center max-w-[18px] min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233497" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65127" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "0%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233499" data-name="Style=Inverse, Size=Medium 18, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233500" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[96.4%] top-1/2" data-node-id="14416:233501" data-name="Fill">
          <div className="flex items-center justify-center max-w-[18px] min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233502" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65121" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "0%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233504" data-name="Style=Accent, Size=Small 16, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-1/2" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233505" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[96.8%] top-1/2" data-node-id="14416:233506">
          <div className="flex items-center justify-center max-w-[16px] min-w-[16px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233507" data-name="10 knob">
                <div className="relative shrink-0 size-[16px]" data-node-id="14416:233508" data-name="Knob">
                  <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                    <img alt="" className="block max-w-none size-full" src={imgKnob1} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "0%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233509" data-name="Style=Primary, Size=Small 16, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-1/2" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233510" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[96.8%] top-1/2" data-node-id="14416:233511">
          <div className="flex items-center justify-center max-w-[16px] min-w-[16px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233512" data-name="10 knob">
                <div className="relative shrink-0 size-[16px]" data-node-id="14416:233513" data-name="Knob">
                  <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                    <img alt="" className="block max-w-none size-full" src={imgKnob1} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "0%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233514" data-name="Style=Inverse, Size=Small 16, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-1/2" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233515" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[96.8%] top-1/2" data-node-id="14416:233516">
          <div className="flex items-center justify-center max-w-[16px] min-w-[16px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233517" data-name="10 knob">
                <div className="relative shrink-0 size-[16px]" data-node-id="14416:233518" data-name="Knob">
                  <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                    <img alt="" className="block max-w-none size-full" src={imgKnob1} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "0%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233524" data-name="Style=Primary, Size=Large 24, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233525" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[95.2%] top-1/2" data-node-id="14416:233526" data-name="Fill">
          <div className="flex items-center justify-center max-w-[24px] min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233527" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65117" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "0%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233529" data-name="Style=Inverse, Size=Large 24, Value=0%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233530" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[95.2%] top-1/2" data-node-id="14416:233531" data-name="Fill">
          <div className="flex items-center justify-center max-w-[24px] min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233532" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65055" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "10%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233534" data-name="Style=Accent, Size=Medium 18, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233535" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[90%] top-1/2" data-node-id="14416:233536" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233537" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65111" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "10%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233539" data-name="Style=Primary, Size=Medium 18, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233540" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[90%] top-1/2" data-node-id="14416:233541" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233542" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65081" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "10%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233544" data-name="Style=Inverse, Size=Medium 18, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233545" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[90%] top-1/2" data-node-id="14416:233546" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233547" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65105" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "10%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233549" data-name="Style=Accent, Size=Small 16, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233550" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[90%] top-1/2" data-node-id="14416:233551" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233552" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65035" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "10%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233554" data-name="Style=Primary, Size=Small 16, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233555" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[90%] top-1/2" data-node-id="14416:233556" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233557" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65101" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "10%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233559" data-name="Style=Inverse, Size=Small 16, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233560" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[90%] top-1/2" data-node-id="14416:233561" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233562" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65063" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "10%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233564" data-name="Style=Accent, Size=Large 24, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233565" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[90%] top-1/2" data-node-id="14416:233566" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233567" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65079" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "10%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233569" data-name="Style=Primary, Size=Large 24, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233570" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[90%] top-1/2" data-node-id="14416:233571" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233572" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65097" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "10%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233574" data-name="Style=Inverse, Size=Large 24, Value=10%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233575" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[90%] top-1/2" data-node-id="14416:233576" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233577" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65067" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "20%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233579" data-name="Style=Accent, Size=Medium 18, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233580" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[80%] top-1/2" data-node-id="14416:233581" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233582" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65077" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "20%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233584" data-name="Style=Primary, Size=Medium 18, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233585" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[80%] top-1/2" data-node-id="14416:233586" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233587" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65073" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "20%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233589" data-name="Style=Inverse, Size=Medium 18, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233590" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[80%] top-1/2" data-node-id="14416:233591" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233592" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65069" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "20%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233594" data-name="Style=Accent, Size=Small 16, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233595" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[80%] top-1/2" data-node-id="14416:233596" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233597" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65045" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "20%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233599" data-name="Style=Primary, Size=Small 16, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233600" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[80%] top-1/2" data-node-id="14416:233601" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233602" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65059" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "20%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233604" data-name="Style=Inverse, Size=Small 16, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233605" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[80%] top-1/2" data-node-id="14416:233606" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233607" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65099" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "20%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233609" data-name="Style=Accent, Size=Large 24, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233610" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[80%] top-1/2" data-node-id="14416:233611" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233612" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65027" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "20%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233614" data-name="Style=Primary, Size=Large 24, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233615" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[80%] top-1/2" data-node-id="14416:233616" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233617" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65015" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "20%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233619" data-name="Style=Inverse, Size=Large 24, Value=20%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233620" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[80%] top-1/2" data-node-id="14416:233621" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233622" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65083" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "30%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233624" data-name="Style=Accent, Size=Medium 18, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233625" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[70%] top-1/2" data-node-id="14416:233626" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233627" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65051" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "30%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233629" data-name="Style=Primary, Size=Medium 18, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233630" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[70%] top-1/2" data-node-id="14416:233631" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233632" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65047" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "30%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233634" data-name="Style=Inverse, Size=Medium 18, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233635" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[70%] top-1/2" data-node-id="14416:233636" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233637" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65041" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "30%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233639" data-name="Style=Accent, Size=Small 16, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233640" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[70%] top-1/2" data-node-id="14416:233641" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233642" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65039" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "30%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233644" data-name="Style=Primary, Size=Small 16, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233645" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[70%] top-1/2" data-node-id="14416:233646" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233647" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65037" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "30%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233649" data-name="Style=Inverse, Size=Small 16, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233650" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[70%] top-1/2" data-node-id="14416:233651" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233652" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65093" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "30%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233654" data-name="Style=Accent, Size=Large 24, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233655" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[70%] top-1/2" data-node-id="14416:233656" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233657" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65029" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "30%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233659" data-name="Style=Primary, Size=Large 24, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233660" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[70%] top-1/2" data-node-id="14416:233661" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233662" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65087" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "30%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233664" data-name="Style=Inverse, Size=Large 24, Value=30%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233665" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[70%] top-1/2" data-node-id="14416:233666" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233667" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65017" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "40%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233669" data-name="Style=Accent, Size=Medium 18, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233670" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[60%] top-1/2" data-node-id="14416:233671" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233672" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65089" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "40%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233674" data-name="Style=Primary, Size=Medium 18, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233675" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[60%] top-1/2" data-node-id="14416:233676" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233677" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65071" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "40%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233679" data-name="Style=Inverse, Size=Medium 18, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233680" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[60%] top-1/2" data-node-id="14416:233681" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233682" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65013" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "40%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233684" data-name="Style=Accent, Size=Small 16, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233685" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[60%] top-1/2" data-node-id="14416:233686" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233687" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65011" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "40%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233689" data-name="Style=Primary, Size=Small 16, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233690" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[60%] top-1/2" data-node-id="14416:233691" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233692" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65023" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "40%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233694" data-name="Style=Inverse, Size=Small 16, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233695" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[60%] top-1/2" data-node-id="14416:233696" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233697" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65007" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "40%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233699" data-name="Style=Accent, Size=Large 24, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233700" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[60%] top-1/2" data-node-id="14416:233701" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233702" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65061" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "40%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233704" data-name="Style=Primary, Size=Large 24, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233705" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[60%] top-1/2" data-node-id="14416:233706" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233707" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65043" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "40%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233709" data-name="Style=Inverse, Size=Large 24, Value=40%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233710" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[60%] top-1/2" data-node-id="14416:233711" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233712" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65019" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "50%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233714" data-name="Style=Accent, Size=Medium 18, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233715" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-1/2 top-1/2" data-node-id="14416:233716" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233717" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65057" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "50%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233719" data-name="Style=Primary, Size=Medium 18, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233720" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-1/2 top-1/2" data-node-id="14416:233721" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233722" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65065" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "50%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233724" data-name="Style=Inverse, Size=Medium 18, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233725" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-1/2 top-1/2" data-node-id="14416:233726" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233727" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65003" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "50%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233729" data-name="Style=Accent, Size=Small 16, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233730" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-1/2 top-1/2" data-node-id="14416:233731" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233732" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65125" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "50%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233734" data-name="Style=Primary, Size=Small 16, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233735" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-1/2 top-1/2" data-node-id="14416:233736" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233737" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65107" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "50%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233739" data-name="Style=Inverse, Size=Small 16, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233740" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-1/2 top-1/2" data-node-id="14416:233741" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233742" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65123" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "50%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233744" data-name="Style=Accent, Size=Large 24, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233745" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-1/2 top-1/2" data-node-id="14416:233746" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233747" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64999" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "50%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233749" data-name="Style=Primary, Size=Large 24, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233750" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-1/2 top-1/2" data-node-id="14416:233751" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233752" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65115" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "50%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233754" data-name="Style=Inverse, Size=Large 24, Value=50%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233755" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-1/2 top-1/2" data-node-id="14416:233756" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233757" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65009" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "60%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233759" data-name="Style=Accent, Size=Medium 18, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233760" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[40%] top-1/2" data-node-id="14416:233761" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233762" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65113" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "60%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233764" data-name="Style=Primary, Size=Medium 18, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233765" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[40%] top-1/2" data-node-id="14416:233766" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233767" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65033" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "60%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233769" data-name="Style=Inverse, Size=Medium 18, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233770" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[40%] top-1/2" data-node-id="14416:233771" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233772" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65085" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "60%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233774" data-name="Style=Accent, Size=Small 16, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233775" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[40%] top-1/2" data-node-id="14416:233776" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233777" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64997" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "60%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233779" data-name="Style=Primary, Size=Small 16, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233780" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[40%] top-1/2" data-node-id="14416:233781" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233782" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64995" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "60%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233784" data-name="Style=Inverse, Size=Small 16, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233785" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[40%] top-1/2" data-node-id="14416:233786" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233787" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64993" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "60%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233789" data-name="Style=Accent, Size=Large 24, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233790" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[40%] top-1/2" data-node-id="14416:233791" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233792" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64991" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "60%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233794" data-name="Style=Primary, Size=Large 24, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233795" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[40%] top-1/2" data-node-id="14416:233796" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233797" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64989" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "60%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233799" data-name="Style=Inverse, Size=Large 24, Value=60%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233800" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[40%] top-1/2" data-node-id="14416:233801" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233802" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64987" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "70%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233804" data-name="Style=Accent, Size=Medium 18, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233805" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[30%] top-1/2" data-node-id="14416:233806" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233807" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64985" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "70%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233809" data-name="Style=Primary, Size=Medium 18, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233810" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[30%] top-1/2" data-node-id="14416:233811" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233812" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64983" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "70%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233814" data-name="Style=Inverse, Size=Medium 18, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233815" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[30%] top-1/2" data-node-id="14416:233816" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233817" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65091" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "70%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233819" data-name="Style=Accent, Size=Small 16, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233820" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[30%] top-1/2" data-node-id="14416:233821" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233822" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65075" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "70%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233824" data-name="Style=Primary, Size=Small 16, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233825" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[30%] top-1/2" data-node-id="14416:233826" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233827" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64981" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "70%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233829" data-name="Style=Inverse, Size=Small 16, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233830" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[30%] top-1/2" data-node-id="14416:233831" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233832" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64979" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "70%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233834" data-name="Style=Accent, Size=Large 24, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233835" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[30%] top-1/2" data-node-id="14416:233836" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233837" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64977" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "70%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233839" data-name="Style=Primary, Size=Large 24, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233840" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[30%] top-1/2" data-node-id="14416:233841" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233842" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64975" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "70%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233844" data-name="Style=Inverse, Size=Large 24, Value=70%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233845" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[30%] top-1/2" data-node-id="14416:233846" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233847" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65109" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "80%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233849" data-name="Style=Accent, Size=Medium 18, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233850" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[20%] top-1/2" data-node-id="14416:233851" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233852" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64971" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "80%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233854" data-name="Style=Primary, Size=Medium 18, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233855" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[20%] top-1/2" data-node-id="14416:233856" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233857" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65031" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "80%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233859" data-name="Style=Inverse, Size=Medium 18, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233860" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[20%] top-1/2" data-node-id="14416:233861" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233862" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64969" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "80%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233864" data-name="Style=Accent, Size=Small 16, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233865" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[20%] top-1/2" data-node-id="14416:233866" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233867" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65119" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "80%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233869" data-name="Style=Primary, Size=Small 16, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233870" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[20%] top-1/2" data-node-id="14416:233871" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233872" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64967" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "80%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233874" data-name="Style=Inverse, Size=Small 16, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233875" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[20%] top-1/2" data-node-id="14416:233876" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233877" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64965" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "80%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233879" data-name="Style=Accent, Size=Large 24, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233880" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[20%] top-1/2" data-node-id="14416:233881" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233882" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64963" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "80%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233884" data-name="Style=Primary, Size=Large 24, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233885" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[20%] top-1/2" data-node-id="14416:233886" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233887" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64959" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "80%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233889" data-name="Style=Inverse, Size=Large 24, Value=80%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233890" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[20%] top-1/2" data-node-id="14416:233891" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233892" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65021" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "90%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233894" data-name="Style=Accent, Size=Medium 18, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233895" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[10%] top-1/2" data-node-id="14416:233896" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233897" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65049" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "90%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233899" data-name="Style=Primary, Size=Medium 18, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233900" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[10%] top-1/2" data-node-id="14416:233901" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233902" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65103" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "90%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233904" data-name="Style=Inverse, Size=Medium 18, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233905" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-[10%] top-1/2" data-node-id="14416:233906" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233907" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65005" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "90%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233909" data-name="Style=Accent, Size=Small 16, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233910" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[10%] top-1/2" data-node-id="14416:233911" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233912" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64957" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "90%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233914" data-name="Style=Primary, Size=Small 16, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233915" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[10%] top-1/2" data-node-id="14416:233916" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233917" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64953" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "90%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233919" data-name="Style=Inverse, Size=Small 16, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233920" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-[10%] top-1/2" data-node-id="14416:233921" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233922" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65001" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "90%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233924" data-name="Style=Accent, Size=Large 24, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233925" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[10%] top-1/2" data-node-id="14416:233926" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233927" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64951" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "90%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233929" data-name="Style=Primary, Size=Large 24, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233930" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[10%] top-1/2" data-node-id="14416:233931" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233932" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65095" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "90%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233934" data-name="Style=Inverse, Size=Large 24, Value=90%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233935" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[10%] top-1/2" data-node-id="14416:233936" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233937" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:65053" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Medium 18" && value === "100%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233939" data-name="Style=Accent, Size=Medium 18, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233940" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-0 top-1/2" data-node-id="14416:233941" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233942" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64949" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Medium 18" && value === "100%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233944" data-name="Style=Primary, Size=Medium 18, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233945" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-0 top-1/2" data-node-id="14416:233946" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233947" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64961" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Medium 18" && value === "100%") {
    return (
      <div className={className || "h-[18px] relative w-[500px]"} data-node-id="14416:233949" data-name="Style=Inverse, Size=Medium 18, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[18px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00661191cqw,99.07cqh)] skew-x-[-0.11deg] w-[99.9934cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233950" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[18px] items-start left-0 right-0 top-1/2" data-node-id="14416:233951" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[18px] items-center justify-end p-px relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233952" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64947" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Small 16" && value === "100%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233954" data-name="Style=Accent, Size=Small 16, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233955" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-0 top-1/2" data-node-id="14416:233956" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233957" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64945" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Small 16" && value === "100%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233959" data-name="Style=Primary, Size=Small 16, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233960" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-0 top-1/2" data-node-id="14416:233961" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233962" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:64955" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Small 16" && value === "100%") {
    return (
      <div className={className || "h-[16px] relative w-[500px]"} data-node-id="14416:233964" data-name="Style=Inverse, Size=Small 16, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[4px] items-center justify-center left-0 right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00146939cqw,95.9468cqh)] skew-x-[-0.11deg] w-[99.9985cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233965" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] h-[4px] items-end justify-center left-0 right-0 top-1/2" data-node-id="14416:233966" data-name="Fill">
          <div className="flex items-center justify-center min-w-[18px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[4px] items-center justify-end relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233967" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[16.021px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[16px]" data-node-id="14450:65025" data-name="Knob">
                      <div className="absolute inset-[-12.5%_-18.75%_-25%_-18.75%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Accent" && size === "Large 24" && value === "100%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233969" data-name="Style=Accent, Size=Large 24, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233970" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-0 top-1/2" data-node-id="14416:233971" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233972" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64943" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Primary" && size === "Large 24" && value === "100%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233974" data-name="Style=Primary, Size=Large 24, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233975" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-0 top-1/2" data-node-id="14416:233976" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--background-primary,#171717)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233977" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64973" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (style === "Inverse" && size === "Large 24" && value === "100%") {
    return (
      <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233979" data-name="Style=Inverse, Size=Large 24, Value=100%">
        <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
            <div className="bg-[var(--layer-primary-2-default,rgba(0,0,0,0.1))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233980" data-name="100 surface" />
          </div>
        </div>
        <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-0 top-1/2" data-node-id="14416:233981" data-name="Fill">
          <div className="flex items-center justify-center min-w-[24px] relative shrink-0 w-full">
            <div className="flex-none skew-x-[-0.08deg] w-full">
              <div className="bg-[var(--layer-primary-inverse-default,rgba(255,255,255,0.9))] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233982" data-name="10 knob">
                <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                  <div className="flex-none skew-x-[0.08deg]">
                    <div className="relative size-[20px]" data-node-id="14450:64941" data-name="Knob">
                      <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                        <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={className || "h-[24px] relative w-[500px]"} data-node-id="14416:233519" data-name="Style=Accent, Size=Large 24, Value=0%">
      <div className="-translate-y-1/2 absolute flex h-[24px] items-center justify-center left-[-0.01%] right-0 top-[calc(50%+0.08px)]" style={{ containerType: "size" }}>
        <div className="flex-none h-[hypot(-0.00881568cqw,99.3008cqh)] skew-x-[-0.11deg] w-[99.9912cqw]">
          <div className="bg-[var(--layer-primary-1-default,rgba(0,0,0,0.04))] relative rounded-[var(--corner-xxlarge,24px)] size-full" data-node-id="14416:233520" data-name="100 surface" />
        </div>
      </div>
      <div className="-translate-y-1/2 absolute content-stretch flex flex-col gap-[var(--gap-and-padding\/medium,0px)] items-start left-0 right-[95.2%] top-1/2" data-node-id="14416:233521" data-name="Fill">
        <div className="flex items-center justify-center max-w-[24px] min-w-[24px] relative shrink-0 w-full">
          <div className="flex-none skew-x-[-0.08deg] w-full">
            <div className="bg-[var(--background-accent,#004cff)] content-stretch flex h-[24px] items-center justify-end p-[2px] relative rounded-[var(--corner-xxlarge,24px)] w-full" data-node-id="14416:233522" data-name="10 knob">
              <div className="flex items-center justify-center relative shrink-0 w-[20.026px]">
                <div className="flex-none skew-x-[0.08deg]">
                  <div className="relative size-[20px]" data-node-id="14450:64939" data-name="Knob">
                    <div className="absolute inset-[-10%_-15%_-20%_-15%]">
                      <img alt="" className="block max-w-none size-full" src={imgKnob2} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
