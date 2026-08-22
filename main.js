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

        for (let i = 0; i < fleaCount; i++) {
            logicalSizes.push(
                Phaser.Math.Between(28, 72)
            );
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
            "Click a flea to make your prediction.",
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

            // Used by the Newtonian jumping version.
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


    positionFeedingFlea(flea, visited = new Set()) {
        if (
            !flea ||
            !flea.alive ||
            !flea.feeding ||
            !flea.host ||
            !flea.host.alive
        ) {
            return;
        }

        // Protect against an accidental host cycle.
        if (visited.has(flea)) {
            return;
        }

        visited.add(flea);

        /*
         * If the host is itself feeding on another flea,
         * position that lower part of the stack first.
         */
        if (flea.host.feeding) {
            this.positionFeedingFlea(
                flea.host,
                visited
            );
        }

        const host = flea.host;

        /*
         * Keep parasite immediately above its host.
         * Phaser positions sprites by their centers.
         */
        flea.sprite.x = host.sprite.x;

        flea.sprite.y =
            host.sprite.y -
            host.sprite.displayHeight / 2 -
            flea.sprite.displayHeight / 2 -
            2;

        /*
         * Usually this changes nothing. It only intervenes if an
         * unusually tall stack would leave the visible play area.
         */
        this.keepFleaVisible(flea);
    }


    positionAllFeedingFleas() {
        for (const flea of this.fleas) {
            if (
                flea.alive &&
                flea.feeding
            ) {
                this.positionFeedingFlea(
                    flea,
                    new Set()
                );
            }
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
        if (this.simulationRunning || this.gameFinished) {
            return;
        }

        if (!this.selectedFlea) {
            this.selectionText.setText(
                "Pick a flea first."
            );
            return;
        }

        this.simulationRunning = true;

        this.jumpButton.disableInteractive();
        this.jumpButton.setAlpha(0.4);

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
         * Physics development proceeds one level at a time.
         *
         * Demo (2 fleas): empirical flea ballistics.
         * Levels 1-6: keep the existing geometric travel for now.
         */
        if (this.levelFleaCount === 2) {
            this.prepareBallisticJump(
                flea,
                host
            );
        } else {
            this.prepareGeometricJump(
                flea,
                host
            );
        }
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


    prepareBallisticJump(flea, host) {
        /*
         * OPTION 1B — empirical flea biomechanics.
         *
         * Archaeopsyllus erinacei measurements:
         *
         * mean takeoff velocity: ~1.3 m/s
         * observed range:        0.9 - 1.85 m/s
         * mean elevation:        ~39 degrees
         * observed range:        28 - 52 degrees
         *
         * We prefer 39 degrees and alter launch speed to reach
         * the host, matching the observed biological strategy.
         */

        const GRAVITY = 9.81;

        /*
         * Game-to-world conversion.
         *
         * This does NOT claim that a sprite pixel is literally part
         * of the flea's body scale. It maps the playing field onto
         * real jump distance.
         */
        const PIXELS_PER_METER = 1200;

        const MIN_SPEED = 0.90;
        const MAX_SPEED = 1.85;

        const MIN_ANGLE = 28;
        const MAX_ANGLE = 52;
        const PREFERRED_ANGLE = 39;

        /*
         * Real flea jumps happen too quickly for a player to inspect.
         * Uniform slow motion preserves trajectory and arrival order.
         */
        const SLOW_MOTION = 6.0;

        const startX = flea.sprite.x;
        const startY = flea.sprite.y;

        /*
         * Land ON TOP of the host.
         *
         * Because the parasite is smaller than its larger host,
         * its centre can land somewhat toward the approaching edge
         * while its whole body remains supported by the host.
         */
        const maximumTopOffset = Math.max(
            0,
            (
                host.sprite.displayWidth -
                flea.sprite.displayWidth
            ) / 2 - 2
        );

        let approachDirection =
            Math.sign(startX - host.sprite.x);

        if (approachDirection === 0) {
            /*
             * Deterministic choice for the rare vertically aligned
             * case, giving the projectile some horizontal distance.
             */
            approachDirection =
                host.sprite.x < this.scale.width / 2
                    ? 1
                    : -1;
        }

        let targetX =
            host.sprite.x +
            approachDirection *
            maximumTopOffset;

        const targetY =
            host.sprite.y -
            (
                host.sprite.displayHeight / 2 +
                flea.sprite.displayHeight / 2 +
                2
            );

        let dxPixels =
            targetX - startX;

        /*
         * Avoid an exactly vertical shot. Natural flea jumps have
         * substantial horizontal components.
         */
        if (Math.abs(dxPixels) < 4) {
            targetX +=
                approachDirection * 4;

            dxPixels =
                targetX - startX;
        }

        const direction =
            Math.sign(dxPixels);

        const x =
            Math.abs(dxPixels) /
            PIXELS_PER_METER;

        /*
         * Positive y means upward in the physical equations.
         */
        const y =
            (startY - targetY) /
            PIXELS_PER_METER;

        /*
         * For a chosen elevation theta:
         *
         * y = x tan(theta)
         *     - g x^2 /
         *       (2 v^2 cos^2(theta))
         *
         * Solve for v.
         *
         * Search the measured flea-angle window and choose the
         * solution closest to the observed mean angle of 39 degrees.
         */
        let best = null;
        let fallback = null;

        for (
            let angleDeg = MIN_ANGLE;
            angleDeg <= MAX_ANGLE;
            angleDeg += 0.25
        ) {
            const theta =
                Phaser.Math.DegToRad(
                    angleDeg
                );

            const cosTheta =
                Math.cos(theta);

            const denominator =
                2 *
                cosTheta *
                cosTheta *
                (
                    x * Math.tan(theta) -
                    y
                );

            if (denominator <= 0) {
                continue;
            }

            const speed =
                Math.sqrt(
                    GRAVITY *
                    x *
                    x /
                    denominator
                );

            if (!Number.isFinite(speed)) {
                continue;
            }

            const candidate = {
                angleDeg,
                theta,
                speed,
                angleError:
                    Math.abs(
                        angleDeg -
                        PREFERRED_ANGLE
                    )
            };

            /*
             * Prefer a solution inside the measured velocity range.
             */
            if (
                speed >= MIN_SPEED &&
                speed <= MAX_SPEED
            ) {
                if (
                    !best ||
                    candidate.angleError <
                        best.angleError
                ) {
                    best = candidate;
                }
            }

            /*
             * Keep the closest physical solution as an emergency
             * fallback for an unusual generated geometry.
             */
            const speedError =
                speed < MIN_SPEED
                    ? MIN_SPEED - speed
                    : speed > MAX_SPEED
                        ? speed - MAX_SPEED
                        : 0;

            candidate.speedError =
                speedError;

            if (
                !fallback ||
                speedError <
                    fallback.speedError ||
                (
                    speedError ===
                        fallback.speedError &&
                    candidate.angleError <
                        fallback.angleError
                )
            ) {
                fallback = candidate;
            }
        }

        const solution =
            best || fallback;

        if (!solution) {
            /*
             * Should be exceptionally rare with the compact
             * two-flea Demo layout. Fall back to geometric movement
             * rather than breaking the game.
             */
            console.warn(
                "No ballistic solution; using geometric fallback."
            );

            this.prepareGeometricJump(
                flea,
                host
            );

            return;
        }

        if (!best) {
            console.warn(
                "Jump required speed outside measured 0.9-1.85 m/s range:",
                solution.speed
            );
        }

        const vx =
            direction *
            solution.speed *
            Math.cos(
                solution.theta
            );

        const vy =
            solution.speed *
            Math.sin(
                solution.theta
            );

        const flightTime =
            x /
            (
                solution.speed *
                Math.cos(
                    solution.theta
                )
            );

        /*
         * Mass scaling requested for Option 1B.
         *
         * Reference flea:
         *   body length ~1.8 mm
         *   mass ~0.7 mg
         *
         * Similar shape/density:
         *   mass proportional to height^3.
         *
         * Game logical side 50 is our reference-size flea.
         */
        const logicalHeight =
            Math.sqrt(flea.area);

        const referenceLogicalHeight = 50;
        const referenceMassKg =
            0.7e-6;

        const massKg =
            referenceMassKg *
            Math.pow(
                logicalHeight /
                    referenceLogicalHeight,
                3
            );

        const kineticEnergyJ =
            0.5 *
            massKg *
            solution.speed *
            solution.speed;

        flea.flight = {
            startX,
            startY,
            targetX,
            targetY,

            vx,
            vy,

            gravity: GRAVITY,
            pixelsPerMeter:
                PIXELS_PER_METER,

            physicalDuration:
                flightTime,

            slowMotion:
                SLOW_MOTION,

            startTime:
                this.time.now,

            angleDeg:
                solution.angleDeg,

            speed:
                solution.speed,

            massKg,

            kineticEnergyJ
        };

        flea.jumping = true;

        /*
         * Airborne parasite always renders in front.
         */
        flea.sprite.setDepth(
            1000 + flea.number
        );

        console.log(
            `Flea ${flea.number} jump:`,
            `angle=${solution.angleDeg.toFixed(1)} deg`,
            `speed=${solution.speed.toFixed(3)} m/s`,
            `mass=${(massKg * 1e6).toFixed(3)} mg`,
            `energy=${(kineticEnergyJ * 1e6).toFixed(3)} uJ`,
            `physical flight=${flightTime.toFixed(3)} s`
        );
    }


    landOnHost(flea) {
        flea.jumping = false;
        flea.feeding = true;
        flea.flight = null;

        flea.host.hasFleas = true;

        /*
         * Parasite remains in front of the host while feeding.
         */
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
         * OPTION 1B ballistic motion.
         */
        if (flea.flight) {
            const flight =
                flea.flight;

            const displayedSeconds =
                (
                    this.time.now -
                    flight.startTime
                ) / 1000;

            const t =
                displayedSeconds /
                flight.slowMotion;

            if (
                t >=
                flight.physicalDuration
            ) {
                /*
                 * Snap the tiny floating-point remainder to exact
                 * top-edge contact.
                 */
                flea.sprite.x =
                    flight.targetX;

                flea.sprite.y =
                    flight.targetY;

                this.landOnHost(flea);
                return;
            }

            const physicalX =
                flight.vx * t;

            const physicalY =
                flight.vy * t -
                0.5 *
                flight.gravity *
                t *
                t;

            flea.sprite.x =
                flight.startX +
                physicalX *
                flight.pixelsPerMeter;

            /*
             * Phaser y increases downward, physics y upward.
             */
            flea.sprite.y =
                flight.startY -
                physicalY *
                flight.pixelsPerMeter;

            return;
        }

        /*
         * Existing geometric movement retained temporarily for
         * Levels 1-6 while physics is debugged incrementally.
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
