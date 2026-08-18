class FleaScene extends Phaser.Scene {
    constructor() {
        super("FleaScene");
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
            28,
            "Which flea will be the last one standing?",
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
        const fleaCount = Phaser.Math.Between(5, 10);

        const occupiedRects = [];

        for (let i = 0; i < fleaCount; i++) {
            const size = Phaser.Math.Between(28, 72);

            let x;
            let y;
            let candidateRect;
            let placed = false;

            for (let attempt = 0; attempt < 100; attempt++) {
                x = Phaser.Math.Between(
                    40 + size / 2,
                    560 - size / 2
                );

                y = Phaser.Math.Between(
                    75 + size / 2,
                    340 - size / 2
                );

                candidateRect = new Phaser.Geom.Rectangle(
                    x - size / 2,
                    y - size / 2,
                    size,
                    size
                );

                const overlaps = occupiedRects.some(rect =>
                    Phaser.Geom.Intersects.RectangleToRectangle(
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

            occupiedRects.push(candidateRect);

            this.createFlea(
                x,
                y,
                size,
                i + 1
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
            Math.sqrt(this.totalInitialArea);

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
            delay: 180,
            loop: true,
            callback: () => {
                if (this.simulationRunning) {
                    this.feedingStep();
                }
            }
        });
    }


    createFlea(x, y, size, number) {
        const sprite = this.add.image(
            x,
            y,
            "flea"
        );

        sprite.setDisplaySize(size, size);

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

            jumping: false,
            feeding: false,
            hasFleas: false,

            host: null,

            /*
             * Remaining old-style Greenfoot x/y movement.
             */
            dx: 0,
            dy: 0,

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
                    flea.host = host;

                    /*
                     * Greenfoot aimed toward the host, with the
                     * parasite positioned approximately above it.
                     */
                    const targetX = host.sprite.x;

                    // Put the parasite immediately above the host,
                    // using half-heights because Phaser sprite
                    // positions are measured from their centers.
                    const rawTargetY =
                        host.sprite.y -
                        (
                            host.sprite.displayHeight / 2 +
                            flea.sprite.displayHeight / 2 +
                            2
                        );

                    // Keep the entire parasite visible.
                    const targetY = Math.max(
                        flea.sprite.displayHeight / 2 + 5,
                        rawTargetY
                    );

                    flea.dx = Math.round(
                        targetX - flea.sprite.x
                    );

                    flea.dy = Math.round(
                        targetY - flea.sprite.y
                    );

                    flea.jumping = true;
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

        attacker.host = target;

        const targetX = target.sprite.x;

        const rawTargetY =
            target.sprite.y -
            (
                target.sprite.displayHeight / 2 +
                attacker.sprite.displayHeight / 2 +
                2
            );

        const targetY = Math.max(
            attacker.sprite.displayHeight / 2 + 5,
            rawTargetY
        );

        attacker.dx = Math.round(
            targetX - attacker.sprite.x
        );

        attacker.dy = Math.round(
            targetY - attacker.sprite.y
        );

        attacker.jumping = true;
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
         * This intentionally reproduces the original
         * pre-physics Greenfoot movement:
         *
         * one pixel vertically and one pixel horizontally
         * on each update.
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
            flea.jumping = false;
            flea.feeding = true;

            flea.host.hasFleas = true;

            /*
             * The Jump button supplied the user gesture,
             * so browser audio should normally be unlocked.
             */
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
        const FEED_AREA_PER_TICK = 120;

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
        const side = Math.sqrt(flea.area);

        flea.sprite.setDisplaySize(
            Math.max(1, side),
            Math.max(1, side)
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

        flea.dx = 0;
        flea.dy = 0;
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
