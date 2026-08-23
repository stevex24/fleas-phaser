class FleaScene extends Phaser.Scene {
    constructor() {
        super("FleaScene");
    }

    init(data) {
        /*
         * Level selection controls flea count only.
         * All simulation rules remain unchanged.
         */
        this.levelFleaCount =
            data && data.fleaCount
                ? data.fleaCount
                : 2;

        this.levelName =
            data && data.levelName
                ? data.levelName
                : "Demo";

        this.demoPhase =
            data && data.demoPhase
                ? data.demoPhase
                : "choose-small";
    }


    preload() {
        this.load.image("flea", "assets/flea.gif");

        this.load.audio("slurp", "assets/slurp.wav");
        this.load.audio("win", "assets/fanfare.wav");
        this.load.audio("lose", "assets/au.wav");
    }

    create() {
        this.cameras.main.setBackgroundColor("#f4efe3");

        this.simulationRunning = false;
        this.gameFinished = false;

        /*
         * Serial physics variant:
         * at most one jump/absorption is active at a time.
         */
        this.serialJumper = null;
        this.serialHost = null;

        this.fleas = [];
        this.selectedFlea = null;


        this.add.text(
            300,
            52,
            `${this.levelName} — ${this.levelFleaCount} fleas`,
            {
                fontFamily: "Arial",
                fontSize: "15px",
                color: "#555555"
            }
        ).setOrigin(0.5);

        this.createLevelSelector();

        this.add.text(
            300,
            24,
            this.levelFleaCount === 2
                ? "Demo: watch how two fleas interact"
                : "Which flea will be the last one standing?",
            {
                fontFamily: "Georgia, serif",
                fontSize: "24px",
                color: "#222222"
            }
        ).setOrigin(0.5);

        /*
         * Classroom/demo population.
         *
         * Random number of fleas, with random size and position.
         */
        const fleaCount = this.levelFleaCount;

        /*
         * Generate all logical flea sizes FIRST.
         *
         * This lets us calculate a visual scale that guarantees
         * sufficient vertical room for even a worst-case stack.
         */
        const logicalSizes = [];

        if (fleaCount === 2) {
            /*
             * Tutorial Demo:
             *
             * Make the rule visually learnable.
             * The smaller flea is roughly 70-80% of the
             * larger flea's side length.
             *
             * Randomize which numbered flea is smaller so
             * the answer is not always "flea 1".
             */
            const largeSize =
                Phaser.Math.Between(58, 68);

            const ratio =
                Phaser.Math.FloatBetween(
                    0.70,
                    0.80
                );

            const smallSize =
                Math.round(
                    largeSize * ratio
                );

            if (Math.random() < 0.5) {
                logicalSizes.push(
                    smallSize,
                    largeSize
                );
            } else {
                logicalSizes.push(
                    largeSize,
                    smallSize
                );
            }
        } else {
            for (
                let i = 0;
                i < fleaCount;
                i++
            ) {
                logicalSizes.push(
                    Phaser.Math.Between(28, 72)
                );
            }
        }

        const layout =
            this.layoutForFleaCount(fleaCount);

        /*
         * Playable vertical region.
         *
         * Leave the title above and controls below untouched.
         */
        const PLAY_TOP = 82;
        const PLAY_BOTTOM = 339;
        const PLAY_HEIGHT =
            PLAY_BOTTOM - PLAY_TOP;

        const STACK_GAP = 2;

        const totalInitialLogicalArea =
            logicalSizes.reduce(
                (sum, side) =>
                    sum + side * side,
                0
            );

        /*
         * For conserved total area A and n surviving square fleas,
         *
         *     sum(sqrt(area_i)) <= sqrt(n * A)
         *
         * so sqrt(n*A) is a safe upper bound on the complete
         * unscaled vertical stack height.
         */
        const worstLogicalStackHeight =
            Math.sqrt(
                fleaCount *
                totalInitialLogicalArea
            );

        /*
         * Reserve about 12% of the available height as aesthetic
         * breathing room rather than filling the field exactly.
         */
        const usableStackHeight =
            PLAY_HEIGHT * 0.88 -
            STACK_GAP * (fleaCount - 1);

        const guaranteedFitScale =
            usableStackHeight /
            worstLogicalStackHeight;

        /*
         * Never enlarge beyond our aesthetic scale table.
         * Only shrink when geometry requires it.
         */
        this.visualScale = Math.min(
            layout.visualScale,
            guaranteedFitScale
        );

        const worstDisplayStackHeight =
            worstLogicalStackHeight *
            this.visualScale +
            STACK_GAP * (fleaCount - 1);

        const occupiedRects = [];

        const centerX = 300;

        console.log(
            "Fleas:", fleaCount,
            "base scale:", layout.visualScale,
            "guaranteed scale:", guaranteedFitScale,
            "used scale:", this.visualScale,
            "worst stack:", worstDisplayStackHeight,
            "available height:", PLAY_HEIGHT
        );

        for (let i = 0; i < fleaCount; i++) {
            const size = logicalSizes[i];

            const displaySize =
                size * this.visualScale;

            let x;
            let y;
            let candidateRect;
            let placed = false;

            /*
             * The critical condition:
             *
             * Every possible host's TOP edge has enough clearance
             * above it for the rest of the worst-case stack.
             *
             * This is deliberately edge-to-edge, not center-to-edge.
             */
            const minY = Math.ceil(
                PLAY_TOP +
                worstDisplayStackHeight -
                displaySize / 2
            );

            const maxY = Math.floor(
                PLAY_BOTTOM -
                displaySize / 2
            );

            for (
                let attempt = 0;
                attempt < 500;
                attempt++
            ) {
                x = Phaser.Math.Between(
                    Math.ceil(
                        centerX -
                        layout.radiusX +
                        displaySize / 2
                    ),
                    Math.floor(
                        centerX +
                        layout.radiusX -
                        displaySize / 2
                    )
                );

                y = Phaser.Math.Between(
                    minY,
                    maxY
                );

                candidateRect =
                    new Phaser.Geom.Rectangle(
                        x - displaySize / 2,
                        y - displaySize / 2,
                        displaySize,
                        displaySize
                    );

                const overlaps =
                    occupiedRects.some(rect =>
                        Phaser.Geom.Intersects
                            .RectangleToRectangle(
                                candidateRect,
                                rect
                            )
                    );

                if (!overlaps) {
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                console.warn(
                    `Could not place flea ${i + 1} without overlap.`
                );
                continue;
            }

            occupiedRects.push(
                candidateRect
            );

            this.createFlea(
                x,
                y,
                size,
                i + 1,
                this.visualScale
            );
        }


        /*
         * Conservation check:
         * if all flea area eventually belongs to one flea,
         * this is its theoretical final square side.
         */
        this.totalInitialArea = this.fleas.reduce(
            (sum, flea) => sum + flea.area,
            0
        );

        this.maximumFinalSide =
            Math.sqrt(this.totalInitialArea) *
            this.visualScale;

        console.log(
            "Initial total flea area:",
            this.totalInitialArea,
            "Maximum final side:",
            this.maximumFinalSide
        );


        this.selectionText = this.add.text(
            300,
            360,
            this.levelFleaCount === 2
                ? (
                    this.demoPhase === "choose-large"
                        ? "Now click the larger flea."
                        : "First click the smaller flea."
                  )
                : "Click a flea to make your prediction.",
            {
                fontFamily: "Arial",
                fontSize: "18px",
                color: "#333333"
            }
        ).setOrigin(0.5);

        this.jumpButton = this.add.text(
            545,
            395,
            "JUMP",
            {
                fontFamily: "Arial",
                fontSize: "20px",
                color: "#ffffff",
                backgroundColor: "#555555",
                padding: {
                    left: 14,
                    right: 14,
                    top: 7,
                    bottom: 7
                }
            }
        ).setOrigin(0.5);

        this.jumpButton.setInteractive({
            useHandCursor: true
        });

        this.jumpButton.on("pointerdown", () => {
            this.beginJumpPhase();
        });

        /*
         * Greenfoot changed flea size on every act().
         * Phaser normally updates ~60 times/sec, which would make
         * feeding essentially instantaneous.
         *
         * We preserve the same 1.1 grow/shrink operation but perform
         * it at a visible interval.
         */
        this.time.addEvent({
            delay: 120,
            loop: true,
            callback: () => {
                if (this.simulationRunning) {
                    this.feedingStep();
                }
            }
        });
    }


    createLevelSelector() {
        const levels = [
            { label: "Demo", fleas: 2 },
            { label: "1", fleas: 3 },
            { label: "2", fleas: 4 },
            { label: "3", fleas: 5 },
            { label: "4", fleas: 6 },
            { label: "5", fleas: 7 },
            { label: "6", fleas: 8 }
        ];

        const startX = 90;
        const spacing = 70;
        const y = 74;

        levels.forEach((level, index) => {
            const active =
                level.fleas === this.levelFleaCount;

            const button = this.add.text(
                startX + index * spacing,
                y,
                level.label,
                {
                    fontFamily: "Arial",
                    fontSize: "14px",
                    color: active
                        ? "#ffffff"
                        : "#222222",
                    backgroundColor: active
                        ? "#555555"
                        : "#dddddd",
                    padding: {
                        left: 9,
                        right: 9,
                        top: 4,
                        bottom: 4
                    }
                }
            ).setOrigin(0.5);

            button.setInteractive({
                useHandCursor: true
            });

            button.on("pointerdown", () => {
                this.scene.restart({
                    fleaCount: level.fleas,
                    levelName:
                        level.label === "Demo"
                            ? "Demo"
                            : `Level ${level.label}`
                });
            });
        });
    }


    layoutForFleaCount(count) {
        /*
         * Difficulty-aware geometry.
         *
         * Fewer fleas:
         *   - larger pictures
         *   - tighter central grouping
         *
         * More fleas:
         *   - smaller pictures
         *   - somewhat wider field
         *
         * Logical area is NOT changed by this scale.
         */
        if (count <= 2) {
            return {
                visualScale: 0.82,
                radiusX: 105,
                radiusY: 62
            };
        }

        if (count <= 3) {
            return {
                visualScale: 0.76,
                radiusX: 120,
                radiusY: 72
            };
        }

        if (count <= 4) {
            return {
                visualScale: 0.70,
                radiusX: 135,
                radiusY: 82
            };
        }

        if (count <= 5) {
            return {
                visualScale: 0.64,
                radiusX: 148,
                radiusY: 90
            };
        }

        if (count <= 6) {
            return {
                visualScale: 0.59,
                radiusX: 158,
                radiusY: 96
            };
        }

        if (count <= 7) {
            return {
                visualScale: 0.54,
                radiusX: 168,
                radiusY: 102
            };
        }

        return {
            visualScale: 0.50,
            radiusX: 178,
            radiusY: 108
        };
    }


    createFlea(x, y, size, number, visualScale) {
        const sprite = this.add.image(
            x,
            y,
            "flea"
        );

        sprite.setDisplaySize(
            size * visualScale,
            size * visualScale
        );

        const flea = {
            sprite,
            number,

            /*
             * Resource carried by this flea.
             *
             * For now the flea is rendered in a square bounding box,
             * so area = side * side. Feeding transfers this quantity
             * exactly between fleas.
             */
            area: size * size,
            initialDisplaySize: size,
            visualScale,

            jumping: false,
            feeding: false,
            hasFleas: false,

            host: null,

            /*
             * Remaining old-style Greenfoot x/y movement.
             */
            dx: 0,
            dy: 0,

            // Newtonian flight state.
            flight: null,

            alive: true,
            chosen: false
        };

        sprite.setInteractive({
            useHandCursor: true
        });

        sprite.on("pointerdown", () => {
            this.selectFlea(flea);
        });

        this.fleas.push(flea);

        return flea;
    }


    feedingChildren(host) {
        return this.fleas.filter(
            flea =>
                flea.alive &&
                flea.feeding &&
                flea.host === host
        );
    }


    positionFeedingTree(host, visited = new Set()) {
        if (
            !host ||
            !host.alive ||
            visited.has(host)
        ) {
            return;
        }

        visited.add(host);

        const children =
            this.feedingChildren(host);

        if (children.length === 0) {
            return;
        }

        const GAP = 3;
        const SIDE_GAP = 5;

        /*
         * Put all fleas feeding directly on this host in a visible
         * row immediately above it.
         *
         * With one parasite this is the familiar vertical stack.
         * With two or more, they fan slightly left/right instead of
         * occupying the same pixels.
         */
        const totalWidth =
            children.reduce(
                (sum, child) =>
                    sum +
                    child.sprite.displayWidth,
                0
            ) +
            SIDE_GAP *
            (children.length - 1);

        let nextX =
            host.sprite.x -
            totalWidth / 2;

        const tallestChild =
            Math.max(
                ...children.map(
                    child =>
                        child.sprite.displayHeight
                )
            );

        const rowY =
            host.sprite.y -
            host.sprite.displayHeight / 2 -
            tallestChild / 2 -
            GAP;

        for (const child of children) {
            child.sprite.x =
                nextX +
                child.sprite.displayWidth / 2;

            child.sprite.y =
                rowY;

            /*
             * Every parasite remains visually in front of its host.
             */
            child.sprite.setDepth(
                host.sprite.depth + 1
            );

            nextX +=
                child.sprite.displayWidth +
                SIDE_GAP;
        }

        /*
         * A parasite may itself be a host for another feeding flea.
         * Build those higher parts of the stack recursively.
         */
        for (const child of children) {
            this.positionFeedingTree(
                child,
                visited
            );
        }
    }


    collectFeedingComponent(root) {
        const result = [];
        const visited = new Set();

        const visit = flea => {
            if (
                !flea ||
                !flea.alive ||
                visited.has(flea)
            ) {
                return;
            }

            visited.add(flea);
            result.push(flea);

            for (
                const child
                of this.feedingChildren(flea)
            ) {
                visit(child);
            }
        };

        visit(root);

        return result;
    }


    keepFeedingComponentVisible(root) {
        const component =
            this.collectFeedingComponent(root);

        if (component.length <= 1) {
            return;
        }

        const LEFT = 6;
        const RIGHT =
            this.scale.width - 6;

        const TOP = 84;
        const BOTTOM = 344;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (const flea of component) {
            minX = Math.min(
                minX,
                flea.sprite.x -
                flea.sprite.displayWidth / 2
            );

            maxX = Math.max(
                maxX,
                flea.sprite.x +
                flea.sprite.displayWidth / 2
            );

            minY = Math.min(
                minY,
                flea.sprite.y -
                flea.sprite.displayHeight / 2
            );

            maxY = Math.max(
                maxY,
                flea.sprite.y +
                flea.sprite.displayHeight / 2
            );
        }

        let shiftX = 0;
        let shiftY = 0;

        if (minX < LEFT) {
            shiftX =
                LEFT - minX;
        } else if (maxX > RIGHT) {
            shiftX =
                RIGHT - maxX;
        }

        if (minY < TOP) {
            shiftY =
                TOP - minY;
        } else if (maxY > BOTTOM) {
            shiftY =
                BOTTOM - maxY;
        }

        /*
         * Emergency correction moves the connected feeding group
         * together. Relative positions stay unchanged, so nobody is
         * pushed behind somebody else by individual edge clamps.
         */
        if (
            shiftX !== 0 ||
            shiftY !== 0
        ) {
            for (const flea of component) {
                flea.sprite.x += shiftX;
                flea.sprite.y += shiftY;
            }
        }
    }


    positionAllFeedingFleas() {
        /*
         * Roots are hosts that have parasites but are not themselves
         * feeding on another flea.
         */
        const roots =
            this.fleas.filter(
                flea =>
                    flea.alive &&
                    this.feedingChildren(flea).length > 0 &&
                    !flea.feeding
            );

        /*
         * A pathological cycle should never exist, but if every
         * feeding flea happens to have a host, use the first live
         * feeding component rather than hiding it.
         */
        if (roots.length === 0) {
            const fallback =
                this.fleas.find(
                    flea =>
                        flea.alive &&
                        this.feedingChildren(flea).length > 0
                );

            if (fallback) {
                roots.push(fallback);
            }
        }

        for (const root of roots) {
            this.positionFeedingTree(
                root,
                new Set()
            );

            this.keepFeedingComponentVisible(
                root
            );
        }
    }


    keepFleaVisible(flea) {
        if (!flea || !flea.sprite || !flea.sprite.active) {
            return;
        }

        /*
         * Keep the entire bounding box inside the game region.
         *
         * Top space is reserved for the question.
         * Bottom space is reserved for status/JUMP controls.
         */
        const padding = 6;

        const halfWidth =
            flea.sprite.displayWidth / 2;

        const halfHeight =
            flea.sprite.displayHeight / 2;

        const minX =
            halfWidth + padding;

        const maxX =
            this.scale.width -
            halfWidth -
            padding;

        const minY =
            58 +
            halfHeight +
            padding;

        const maxY =
            345 -
            halfHeight -
            padding;

        flea.sprite.x = Phaser.Math.Clamp(
            flea.sprite.x,
            minX,
            maxX
        );

        flea.sprite.y = Phaser.Math.Clamp(
            flea.sprite.y,
            minY,
            maxY
        );
    }


    selectFlea(flea) {
        if (
            this.simulationRunning ||
            this.gameFinished ||
            !flea.alive
        ) {
            return;
        }

        if (this.levelFleaCount === 2) {
            const other =
                this.fleas.find(
                    candidate =>
                        candidate !== flea &&
                        candidate.alive
                );

            if (!other) {
                return;
            }

            const fleaIsSmaller =
                flea.area < other.area;

            const wantSmaller =
                this.demoPhase === "choose-small";

            const correctChoice =
                wantSmaller
                    ? fleaIsSmaller
                    : !fleaIsSmaller;

            if (!correctChoice) {
                this.selectionText.setText(
                    wantSmaller
                        ? "Try again — click the smaller flea."
                        : "Try again — click the larger flea."
                );
                return;
            }

            if (this.selectedFlea) {
                this.selectedFlea.sprite.clearTint();
                this.selectedFlea.chosen = false;
            }

            this.selectedFlea = flea;
            flea.chosen = true;

            // Neutral selection color only.
            flea.sprite.setTint(0xffd966);

            this.selectionText.setText(
                wantSmaller
                    ? "Smaller flea selected. Press JUMP."
                    : "Larger flea selected. Press JUMP."
            );

            return;
        }

        /*
         * Ordinary levels retain normal prediction behavior.
         */
        if (this.selectedFlea) {
            this.selectedFlea.sprite.clearTint();
            this.selectedFlea.chosen = false;
        }

        this.selectedFlea = flea;
        flea.chosen = true;

        flea.sprite.setTint(0xffd966);

        this.selectionText.setText(
            `You picked flea ${flea.number}.`
        );
    }


    beginJumpPhase() {
        if (
            this.simulationRunning ||
            this.gameFinished
        ) {
            return;
        }

        if (!this.selectedFlea) {
            this.selectionText.setText(
                this.levelFleaCount === 2
                    ? (
                        this.demoPhase === "choose-large"
                            ? "First click the larger flea."
                            : "First click the smaller flea."
                      )
                    : "Pick a flea first."
            );
            return;
        }

        this.simulationRunning = true;

        this.jumpButton.disableInteractive();
        this.jumpButton.setAlpha(0.4);

        /*
         * Tutorial Demo:
         * explicitly demonstrate the selected flea's jump.
         */
        if (this.levelFleaCount === 2) {
            const host =
                this.fleas.find(
                    candidate =>
                        candidate !== this.selectedFlea &&
                        candidate.alive
                );

            if (!host) {
                return;
            }

            if (this.demoPhase === "choose-small") {
                this.demoPhase = "small-run";

                this.selectionText.setText(
                    "Watch the smaller flea jump..."
                );
            } else if (
                this.demoPhase === "choose-large"
            ) {
                this.demoPhase = "large-run";

                this.selectionText.setText(
                    "Now watch what happens..."
                );
            }

            this.beginTravelToHost(
                this.selectedFlea,
                host
            );

            return;
        }

        this.selectionText.setText(
            `Flea ${this.selectedFlea.number} selected — jump!`
        );
    }


    update() {
        if (
            !this.simulationRunning ||
            this.gameFinished
        ) {
            return;
        }

        /*
         * The two tutorial demonstrations launch only the flea
         * explicitly selected by the player.
         */
        if (
            this.levelFleaCount === 2 &&
            (
                this.demoPhase === "small-run" ||
                this.demoPhase === "large-run"
            )
        ) {
            if (
                this.selectedFlea &&
                this.selectedFlea.jumping
            ) {
                this.moveTowardHost(
                    this.selectedFlea
                );
            }

            return;
        }

        /*
         * Serial variant:
         *
         * Level 1 and later levels execute exactly one
         * jump/absorption at a time.
         *
         * The two-flea Demo keeps its special tutorial sequence.
         */
        if (this.levelFleaCount >= 3) {
            this.updateSerialSimulation();
            return;
        }

        /*
         * Equivalent to Flea.act().
         */
        for (const flea of this.fleas) {
            if (!flea.alive) {
                continue;
            }

            /*
             * A flea may search only when it is:
             *
             * - not already jumping
             * - not feeding
             * - not itself carrying parasites
             */
            if (
                !flea.jumping &&
                !flea.feeding &&
                !flea.hasFleas
            ) {
                const host =
                    this.lookForLargerFlea(flea);

                if (host) {
                    this.beginTravelToHost(
                        flea,
                        host
                    );
                }
            }

            if (flea.jumping) {
                this.moveTowardHost(flea);
            }
        }

        this.checkForWinner();
        this.resolveStalemateIfNeeded();
    }


    resolveStalemateIfNeeded() {
        if (this.gameFinished) {
            return;
        }

        const survivors =
            this.fleas.filter(flea => flea.alive);

        if (survivors.length <= 1) {
            return;
        }

        const active = survivors.some(
            flea => flea.jumping || flea.feeding
        );

        if (active) {
            return;
        }

        /*
         * Normally a smaller flea will find a larger target.
         * But exact size ties can leave several stationary fleas
         * with nobody legally larger to attack.
         *
         * Break only that deadlock:
         * choose the smallest flea and send it to the nearest
         * other survivor.
         */
        const attacker = survivors.reduce(
            (smallest, flea) =>
                flea.area < smallest.area ? flea : smallest
        );

        let target = null;
        let nearestDistance = Infinity;

        for (const candidate of survivors) {
            if (candidate === attacker) {
                continue;
            }

            const dx =
                candidate.sprite.x - attacker.sprite.x;

            const dy =
                candidate.sprite.y - attacker.sprite.y;

            const distance =
                Math.sqrt(dx * dx + dy * dy);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                target = candidate;
            }
        }

        if (!target) {
            return;
        }

        this.beginTravelToHost(
            attacker,
            target
        );
    }


    beginTravelToHost(flea, host) {
        flea.host = host;

        /*
         * Debug Newtonian physics incrementally:
         * only the two-flea Demo uses it for now.
         */
        /*
         * Serial 1A branch:
         * all game levels now use Newtonian jumping.
         */
        this.preparePhysics1AJump(
            flea,
            host
        );
    }


    prepareGeometricJump(flea, host) {
        const targetX = host.sprite.x;

        const targetY =
            host.sprite.y -
            (
                host.sprite.displayHeight / 2 +
                flea.sprite.displayHeight / 2 +
                2
            );

        flea.dx = Math.round(
            targetX - flea.sprite.x
        );

        flea.dy = Math.round(
            targetY - flea.sprite.y
        );

        flea.flight = null;
        flea.jumping = true;
    }


    preparePhysics1AJump(flea, host) {
        /*
         * OPTION 1A
         *
         * Similar geometry and density:
         *
         *     mass proportional to height^3
         *
         * Assume stored launch energy is proportional to mass.
         * Since
         *
         *     E = 1/2 m v^2
         *
         * constant E/m gives approximately constant launch speed.
         *
         * Mass therefore does NOT alter the free-flight parabola.
         * That is correct Newtonian mechanics.
         */

        const G = 9.81;

        /*
         * Nominal takeoff speed for the simplified model.
         *
         * Unlike 1B, this is a model parameter rather than a claim
         * about measured flea biomechanics.
         */
        const SPEED = 1.50;

        /*
         * Convert screen distance into metres.
         * 1800 pixels corresponds to one simulated metre.
         */
        const PIXELS_PER_METER = 1800;

        /*
         * Real ballistic motion is too quick to inspect.
         * Uniform time dilation changes neither the trajectory
         * nor ordering of arrival events.
         */
        const SLOW_MOTION = 6.0;

        const startX = flea.sprite.x;
        const startY = flea.sprite.y;

        /*
         * Land exactly on top of the host.
         *
         * Move toward the approaching side of its upper surface,
         * but remain fully supported by the host.
         */
        const topOffset = Math.max(
            0,
            (
                host.sprite.displayWidth -
                flea.sprite.displayWidth
            ) / 2 - 2
        );

        let direction =
            Math.sign(
                startX - host.sprite.x
            );

        if (direction === 0) {
            direction =
                host.sprite.x <
                this.scale.width / 2
                    ? 1
                    : -1;
        }

        let targetX =
            host.sprite.x +
            direction * topOffset;

        const targetY =
            host.sprite.y -
            (
                host.sprite.displayHeight / 2 +
                flea.sprite.displayHeight / 2 +
                2
            );

        /*
         * Avoid a mathematically degenerate perfectly vertical shot.
         */
        if (
            Math.abs(
                targetX - startX
            ) < 6
        ) {
            targetX +=
                direction * 6;
        }

        const signedDxPixels =
            targetX - startX;

        const horizontalDirection =
            Math.sign(signedDxPixels);

        const x =
            Math.abs(signedDxPixels) /
            PIXELS_PER_METER;

        /*
         * Physical y is positive upward.
         */
        const y =
            (startY - targetY) /
            PIXELS_PER_METER;

        /*
         * Projectile equation:
         *
         * y =
         * x tan(theta)
         * - g x^2 (1 + tan^2(theta)) / (2 v^2)
         *
         * Let u = tan(theta).
         *
         * This becomes a quadratic:
         *
         * A u^2 - x u + (y + A) = 0
         *
         * where
         *
         * A = g x^2 / (2 v^2)
         */
        const A =
            G * x * x /
            (2 * SPEED * SPEED);

        const discriminant =
            x * x -
            4 * A * (y + A);

        if (
            !Number.isFinite(discriminant) ||
            discriminant < 0 ||
            A <= 0
        ) {
            console.warn(
                "No 1A ballistic solution; using geometric fallback."
            );

            this.prepareGeometricJump(
                flea,
                host
            );

            return;
        }

        const root =
            Math.sqrt(discriminant);

        const tanLow =
            (x - root) /
            (2 * A);

        const tanHigh =
            (x + root) /
            (2 * A);

        const candidateAngles = [
            Math.atan(tanLow),
            Math.atan(tanHigh)
        ].filter(theta =>
            Number.isFinite(theta) &&
            theta > 0 &&
            theta <
                Phaser.Math.DegToRad(85)
        );

        if (candidateAngles.length === 0) {
            console.warn(
                "No usable 1A launch angle; using geometric fallback."
            );

            this.prepareGeometricJump(
                flea,
                host
            );

            return;
        }

        /*
         * Prefer the HIGHER arc because it makes the jumping flea
         * visually obvious and keeps it clear of other sprites.
         *
         * But if that arc would go above the visible playfield,
         * use the lower valid solution instead.
         */
        candidateAngles.sort(
            (a, b) => b - a
        );

        let theta =
            candidateAngles[0];

        for (const candidate of candidateAngles) {
            const vyCandidate =
                SPEED *
                Math.sin(candidate);

            const apexHeightMeters =
                vyCandidate *
                vyCandidate /
                (2 * G);

            const apexScreenY =
                startY -
                apexHeightMeters *
                PIXELS_PER_METER;

            if (apexScreenY > 55) {
                theta = candidate;
                break;
            }
        }

        const vx =
            horizontalDirection *
            SPEED *
            Math.cos(theta);

        const vy =
            SPEED *
            Math.sin(theta);

        const flightTime =
            x /
            (
                SPEED *
                Math.cos(theta)
            );

        /*
         * Requested physical mass model.
         *
         * Use logical side 50 as one reference flea.
         * Absolute reference mass is arbitrary in 1A;
         * the cubic scaling is what matters.
         */
        const logicalHeight =
            Math.sqrt(flea.area);

        const referenceHeight = 50;
        const referenceMass = 1.0;

        const relativeMass =
            referenceMass *
            Math.pow(
                logicalHeight /
                referenceHeight,
                3
            );

        /*
         * Because speed is constant in 1A:
         *
         * kinetic energy scales directly with mass.
         */
        const relativeEnergy =
            0.5 *
            relativeMass *
            SPEED *
            SPEED;

        flea.flight = {
            startX,
            startY,

            targetX,
            targetY,

            vx,
            vy,

            gravity: G,

            pixelsPerMeter:
                PIXELS_PER_METER,

            physicalDuration:
                flightTime,

            slowMotion:
                SLOW_MOTION,

            startTime:
                this.time.now,

            angle:
                theta,

            speed:
                SPEED,

            relativeMass,
            relativeEnergy
        };

        flea.jumping = true;

        /*
         * Airborne flea always appears in front.
         */
        flea.sprite.setDepth(
            1000 + flea.number
        );

        console.log(
            `1A flea ${flea.number}:`,
            `angle=${Phaser.Math.RadToDeg(theta).toFixed(1)} deg`,
            `speed=${SPEED.toFixed(2)}`,
            `relative mass=${relativeMass.toFixed(3)}`,
            `flight=${flightTime.toFixed(3)} s`
        );
    }


    landOnHost(flea) {
        flea.jumping = false;
        flea.flight = null;

        /*
         * Second tutorial example:
         * the larger flea made the attempted jump.
         * Stop here and demonstrate that this is the wrong choice.
         */
        if (
            this.levelFleaCount === 2 &&
            this.demoPhase === "large-run"
        ) {
            this.simulationRunning = false;
            this.gameFinished = true;

            flea.sprite.setTint(0xff7777);

            this.selectionText.setText(
                "That was the larger flea — wrong choice."
            );

            try {
                this.sound.play(
                    "lose",
                    { volume: 0.30 }
                );
            } catch (error) {
                // Tutorial still works without sound.
            }

            /*
             * The two-example tutorial is now complete.
             * Tell the surrounding page that the player is
             * ready for the numbered levels.
             */
            window.dispatchEvent(
                new Event("fleas-demo-complete")
            );

            return;
        }

        /*
         * First tutorial example:
         * smaller flea landed correctly and now consumes its host.
         */
        flea.feeding = true;
        flea.host.hasFleas = true;

        flea.sprite.setDepth(
            flea.host.sprite.depth + 1
        );

        try {
            this.sound.play(
                "slurp",
                { volume: 0.20 }
            );
        } catch (error) {
            console.log(
                "Sound unavailable:",
                error
            );
        }
    }


    chooseNextSerialPair() {
        const survivors =
            this.fleas.filter(
                flea => flea.alive
            );

        if (survivors.length < 2) {
            return null;
        }

        const pairs = [];

        /*
         * Rule 1:
         * Always choose the two CLOSEST surviving fleas.
         */
        for (
            let i = 0;
            i < survivors.length;
            i++
        ) {
            for (
                let j = i + 1;
                j < survivors.length;
                j++
            ) {
                const a = survivors[i];
                const b = survivors[j];

                const dx =
                    a.sprite.x - b.sprite.x;

                const dy =
                    a.sprite.y - b.sprite.y;

                pairs.push({
                    a,
                    b,
                    distanceSquared:
                        dx * dx + dy * dy,

                    /*
                     * Visible geometric tie-breakers if two
                     * pair distances happen to be identical.
                     */
                    pairY:
                        (a.sprite.y + b.sprite.y) / 2,

                    pairX:
                        (a.sprite.x + b.sprite.x) / 2,

                    lowNumber:
                        Math.min(
                            a.number,
                            b.number
                        ),

                    highNumber:
                        Math.max(
                            a.number,
                            b.number
                        )
                });
            }
        }

        /*
         * Closest pair first.
         *
         * Exact distance ties are resolved by the higher pair,
         * then the leftmost pair, with flea numbers retained only
         * as an essentially invisible final deterministic fallback.
         */
        pairs.sort((left, right) => {
            if (
                left.distanceSquared !==
                right.distanceSquared
            ) {
                return (
                    left.distanceSquared -
                    right.distanceSquared
                );
            }

            if (left.pairY !== right.pairY) {
                return left.pairY - right.pairY;
            }

            if (left.pairX !== right.pairX) {
                return left.pairX - right.pairX;
            }

            if (
                left.lowNumber !==
                right.lowNumber
            ) {
                return (
                    left.lowNumber -
                    right.lowNumber
                );
            }

            return (
                left.highNumber -
                right.highNumber
            );
        });

        const chosen = pairs[0];

        let jumper;
        let host;

        const areaDifference =
            chosen.a.area -
            chosen.b.area;

        /*
         * Rule 2:
         * If sizes differ, smaller flea jumps on larger flea.
         */
        if (Math.abs(areaDifference) > 1e-9) {
            if (chosen.a.area < chosen.b.area) {
                jumper = chosen.a;
                host = chosen.b;
            } else {
                jumper = chosen.b;
                host = chosen.a;
            }

            return {
                jumper,
                host
            };
        }

        /*
         * Rule 3:
         * Equal size -> HIGHER flea jumps.
         *
         * Phaser y increases downward, so the higher flea has
         * the SMALLER y coordinate.
         */
        if (
            Math.abs(
                chosen.a.sprite.y -
                chosen.b.sprite.y
            ) > 1e-9
        ) {
            if (
                chosen.a.sprite.y <
                chosen.b.sprite.y
            ) {
                jumper = chosen.a;
                host = chosen.b;
            } else {
                jumper = chosen.b;
                host = chosen.a;
            }

            return {
                jumper,
                host
            };
        }

        /*
         * Rule 4:
         * Same size and same height -> LEFTMOST flea jumps.
         */
        if (
            Math.abs(
                chosen.a.sprite.x -
                chosen.b.sprite.x
            ) > 1e-9
        ) {
            if (
                chosen.a.sprite.x <
                chosen.b.sprite.x
            ) {
                jumper = chosen.a;
                host = chosen.b;
            } else {
                jumper = chosen.b;
                host = chosen.a;
            }

            return {
                jumper,
                host
            };
        }

        /*
         * The initial non-overlap rule should make this final case
         * essentially impossible. Keep flea number only as the final
         * deterministic fallback.
         */
        if (chosen.a.number < chosen.b.number) {
            jumper = chosen.a;
            host = chosen.b;
        } else {
            jumper = chosen.b;
            host = chosen.a;
        }

        return {
            jumper,
            host
        };
    }


    startNextSerialInteraction() {
        if (this.gameFinished) {
            return;
        }

        this.checkForWinner();

        if (this.gameFinished) {
            return;
        }

        const interaction =
            this.chooseNextSerialPair();

        if (!interaction) {
            return;
        }

        this.serialJumper =
            interaction.jumper;

        this.serialHost =
            interaction.host;

        this.selectionText.setText(
            `Flea ${interaction.jumper.number} jumps on flea ${interaction.host.number}...`
        );

        this.beginTravelToHost(
            interaction.jumper,
            interaction.host
        );
    }


    updateSerialSimulation() {
        if (this.gameFinished) {
            return;
        }

        /*
         * If an interaction is active, let it finish completely.
         */
        if (
            this.serialJumper &&
            this.serialJumper.alive
        ) {
            if (
                this.serialJumper.jumping
            ) {
                this.moveTowardHost(
                    this.serialJumper
                );

                return;
            }

            /*
             * feedingStep(), driven by the existing timer,
             * performs the full absorption.
             *
             * Nothing else may start until it finishes.
             */
            if (
                this.serialJumper.feeding
            ) {
                return;
            }
        }

        /*
         * Host disappearance completes the current serial interaction.
         *
         * Normalize the surviving jumper into a completely fresh
         * standalone flea state before choosing the next pair.
         * The next Newtonian solve should therefore be no different
         * from the original two-flea Demo: current position + current
         * size + a newly selected host, with no stale movement state.
         */
        if (
            this.serialJumper &&
            this.serialJumper.alive
        ) {
            this.serialJumper.jumping = false;
            this.serialJumper.feeding = false;
            this.serialJumper.flight = null;
            this.serialJumper.host = null;
            this.serialJumper.dx = 0;
            this.serialJumper.dy = 0;

            /*
             * Ordinary standalone layering again.
             */
            this.serialJumper.sprite.setDepth(0);
        }

        this.serialJumper = null;
        this.serialHost = null;

        this.refreshHasFleas();
        this.checkForWinner();

        if (!this.gameFinished) {
            this.startNextSerialInteraction();
        }
    }


    lookForLargerFlea(flea) {
        let nearest = null;
        let nearestDistance = Infinity;

        for (const candidate of this.fleas) {
            if (
                candidate === flea ||
                !candidate.alive
            ) {
                continue;
            }

            /*
             * Faithful to the Greenfoot rule:
             * target must be larger and stationary.
             */
            if (
                candidate.jumping ||
                candidate.area <= flea.area
            ) {
                continue;
            }

            const dx =
                candidate.sprite.x - flea.sprite.x;

            const dy =
                candidate.sprite.y - flea.sprite.y;

            const distance =
                Math.sqrt(dx * dx + dy * dy);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = candidate;
            }
        }

        return nearest;
    }


    moveTowardHost(flea) {
        if (
            !flea.host ||
            !flea.host.alive
        ) {
            this.releaseFlea(flea);
            return;
        }

        /*
         * Newtonian 1A flight.
         */
        if (flea.flight) {
            const f =
                flea.flight;

            const displayedSeconds =
                (
                    this.time.now -
                    f.startTime
                ) / 1000;

            const t =
                displayedSeconds /
                f.slowMotion;

            if (
                t >=
                f.physicalDuration
            ) {
                /*
                 * Remove only floating-point error at landing.
                 */
                flea.sprite.x =
                    f.targetX;

                flea.sprite.y =
                    f.targetY;

                this.landOnHost(flea);
                return;
            }

            const physicalX =
                f.vx * t;

            const physicalY =
                f.vy * t -
                0.5 *
                f.gravity *
                t *
                t;

            flea.sprite.x =
                f.startX +
                physicalX *
                f.pixelsPerMeter;

            /*
             * Phaser y points downward.
             */
            flea.sprite.y =
                f.startY -
                physicalY *
                f.pixelsPerMeter;

            return;
        }

        /*
         * Existing geometric travel remains for Levels 1-6.
         */
        if (flea.dy > 0) {
            flea.sprite.y += 1;
            flea.dy -= 1;
        }

        if (flea.dy < 0) {
            flea.sprite.y -= 1;
            flea.dy += 1;
        }

        if (flea.dx > 0) {
            flea.sprite.x += 1;
            flea.dx -= 1;
        }

        if (flea.dx < 0) {
            flea.sprite.x -= 1;
            flea.dx += 1;
        }

        this.keepFleaVisible(flea);

        if (
            flea.dx === 0 &&
            flea.dy === 0
        ) {
            this.landOnHost(flea);
        }
    }


    feedingStep() {
        if (this.gameFinished) {
            return;
        }

        /*
         * Exact area-conserving feeding.
         *
         * Every active parasite requests the same amount of area
         * during one feeding tick. If several parasites are attached
         * to one host, they feed simultaneously.
         *
         * We first calculate every transfer from a snapshot, then
         * apply all changes together. This is important for stacks:
         *
         *     A feeds on B
         *     B feeds on C
         *     C feeds on D
         *
         * All three transfers occur during the same tick.
         */
        const FEED_AREA_PER_TICK = 300;

        const survivors =
            this.fleas.filter(flea => flea.alive);

        const delta = new Map();

        for (const flea of survivors) {
            delta.set(flea, 0);
        }

        const feedersByHost = new Map();

        for (const parasite of survivors) {
            if (
                !parasite.feeding ||
                !parasite.host ||
                !parasite.host.alive
            ) {
                continue;
            }

            if (!feedersByHost.has(parasite.host)) {
                feedersByHost.set(
                    parasite.host,
                    []
                );
            }

            feedersByHost
                .get(parasite.host)
                .push(parasite);
        }

        /*
         * Work out all transfers without yet changing anybody's area.
         */
        for (const [host, parasites] of feedersByHost) {
            const requested =
                FEED_AREA_PER_TICK * parasites.length;

            /*
             * Never transfer more area than the host actually
             * possesses at the start of this tick.
             */
            const totalTransfer = Math.min(
                host.area,
                requested
            );

            const eachTransfer =
                totalTransfer / parasites.length;

            delta.set(
                host,
                delta.get(host) - totalTransfer
            );

            for (const parasite of parasites) {
                delta.set(
                    parasite,
                    delta.get(parasite) + eachTransfer
                );
            }
        }

        /*
         * Apply all gains and losses simultaneously.
         */
        for (const flea of survivors) {
            const newArea =
                Math.max(
                    0,
                    flea.area + delta.get(flea)
                );

            this.setFleaArea(
                flea,
                newArea
            );
        }

        /*
         * Growing parasites and shrinking hosts change their
         * dimensions, so restore the visual stack after each
         * simultaneous feeding step.
         */
        this.positionAllFeedingFleas();

        /*
         * A host with no area left has been completely consumed.
         * killFlea() releases any parasites that were attached to it,
         * allowing them to seek their next larger host.
         */
        for (const flea of [...survivors]) {
            if (
                flea.alive &&
                flea.area <= 0.001
            ) {
                this.killFlea(flea);
            }
        }

        this.checkForWinner();
    }


    setFleaArea(flea, newArea) {
        flea.area = Math.max(0, newArea);

        /*
         * Square bounding box for Version 0.1:
         *
         *     side² = area
         *
         * Therefore the final survivor visibly contains exactly the
         * combined bounding-box area of all fleas it has inherited.
         */
        const logicalSide =
            Math.sqrt(flea.area);

        const displaySide =
            logicalSide * flea.visualScale;

        flea.sprite.setDisplaySize(
            Math.max(1, displaySide),
            Math.max(1, displaySide)
        );

        /*
         * Growing parasites may otherwise expand beyond an edge.
         * Shrinking hosts remain at their existing coordinates.
         */
        this.keepFleaVisible(flea);
    }


    killFlea(flea) {
        if (!flea.alive) {
            return;
        }

        /*
         * Release every flea that was feeding on this host.
         */
        for (const parasite of this.fleas) {
            if (
                parasite.alive &&
                parasite.host === flea
            ) {
                this.releaseFlea(parasite);
            }
        }

        flea.alive = false;
        flea.feeding = false;
        flea.jumping = false;
        flea.hasFleas = false;

        flea.sprite.destroy();

        /*
         * Hosts may have disappeared, so recompute this flag
         * for every surviving flea.
         */
        this.refreshHasFleas();

        // If this death created the last survivor,
        // announce the result immediately.
        this.checkForWinner();
    }


    releaseFlea(flea) {
        flea.host = null;
        flea.feeding = false;
        flea.jumping = false;

        // Return to ordinary layering when released.
        flea.sprite.setDepth(0);

        flea.dx = 0;
        flea.dy = 0;
        flea.flight = null;
    }


    refreshHasFleas() {
        for (const flea of this.fleas) {
            flea.hasFleas = false;
        }

        for (const parasite of this.fleas) {
            if (
                parasite.alive &&
                parasite.feeding &&
                parasite.host &&
                parasite.host.alive
            ) {
                parasite.host.hasFleas = true;
            }
        }
    }


    checkForWinner() {
        const survivors =
            this.fleas.filter(
                flea => flea.alive
            );

        if (survivors.length !== 1) {
            return;
        }

        const winner = survivors[0];

        /*
         * Finish the first tutorial demonstration.
         * Victory feedback happens only after the consumption
         * sequence has actually produced its survivor.
         */
        if (
            this.levelFleaCount === 2 &&
            this.demoPhase === "small-run"
        ) {
            this.gameFinished = true;
            this.simulationRunning = false;

            winner.sprite.setTint(0x88ff88);

            this.selectionText.setText(
                "Correct — the smaller flea is the survivor!"
            );

            try {
                this.sound.play(
                    "win",
                    { volume: 0.35 }
                );
            } catch (error) {
                // Tutorial still works without sound.
            }

            this.time.delayedCall(
                1600,
                () => {
                    this.scene.restart({
                        fleaCount: 2,
                        levelName: "Demo",
                        demoPhase: "choose-large"
                    });
                }
            );

            return;
        }

        this.gameFinished = true;
        this.simulationRunning = false;

        if (winner === this.selectedFlea) {
            this.selectionText.setText(
                "Congratulations, you won!"
            );

            try {
                this.sound.play(
                    "win",
                    { volume: 0.35 }
                );
            } catch (error) {
                // Game result still works without sound.
            }
        } else {
            this.selectionText.setText(
                `Sorry — flea ${winner.number} was the last one standing.`
            );

            try {
                this.sound.play(
                    "lose",
                    { volume: 0.30 }
                );
            } catch (error) {
                // Game result still works without sound.
            }
        }

        winner.sprite.setTint(0x88ff88);
    }
}


const config = {
    type: Phaser.AUTO,
    width: 600,
    height: 430,
    backgroundColor: "#f4efe3",
    scene: FleaScene
};

new Phaser.Game(config);
